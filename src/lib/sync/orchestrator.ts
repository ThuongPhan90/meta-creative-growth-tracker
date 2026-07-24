import { SyncAlreadyRunningError } from "@/lib/db/errors";
import type {
  JsonObject,
  JsonValue,
  SyncKind,
} from "@/lib/db/types";

import type {
  MetaSyncStageContext,
  RunSyncInput,
  RunSyncResult,
  SyncStageName,
  SyncStageResult,
  SyncWarning,
} from "./contracts";
import { SyncStageError } from "./contracts";
import { withConnectionSyncLock } from "./lock";

export function stagesForSyncKind(syncKind: SyncKind): SyncStageName[] {
  switch (syncKind) {
    case "assets":
      return ["validate", "assets"];
    case "insights":
      return ["validate", "insights"];
    case "full":
    case "incremental":
      return ["validate", "assets", "insights"];
  }
}

function safeError(error: unknown): {
  code: string;
  message: string;
  details?: JsonValue;
} {
  if (error instanceof SyncStageError) {
    return {
      code: error.code,
      message: error.message.slice(0, 2_000),
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: error.name || "SYNC_FAILED",
      message: error.message.slice(0, 2_000),
    };
  }

  return {
    code: "SYNC_FAILED",
    message: "Unknown sync failure.",
  };
}

function warningsToJson(warnings: readonly SyncWarning[]): JsonValue {
  return warnings.map((warning) => ({
    code: warning.code,
    message: warning.message,
    resource: warning.resource ?? null,
  }));
}

async function executeStage(
  stage: SyncStageName,
  context: MetaSyncStageContext,
  input: RunSyncInput,
): Promise<SyncStageResult> {
  switch (stage) {
    case "validate":
      return input.adapter.validate(context);
    case "assets":
      return input.adapter.syncAssets(context);
    case "insights":
      return input.adapter.syncInsights(context);
  }
}

export async function runMetaSync(input: RunSyncInput): Promise<RunSyncResult> {
  const run = await input.repository.createSyncRun({
    connectionId: input.connectionId,
    requestKey: input.requestKey,
    syncKind: input.syncKind,
    triggerSource: input.triggerSource,
    windowStart: input.window?.dateFrom ?? null,
    windowEnd: input.window?.dateTo ?? null,
  });

  if (run.status !== "queued") {
    return { run, warnings: [] };
  }

  try {
    return await withConnectionSyncLock(
      input.repository.database,
      input.connectionId,
      async () => {
        await input.repository.recoverInterruptedSyncRuns(
          input.connectionId,
          run.syncRunId,
        );
        const stages = stagesForSyncKind(input.syncKind);
        const warnings: SyncWarning[] = [];
        const aggregateStats: JsonObject = {};

        await input.repository.startSyncRun(run.syncRunId, stages[0]);

        for (let index = 0; index < stages.length; index += 1) {
          if (input.signal?.aborted) {
            await input.repository.finishSyncRun({
              syncRunId: run.syncRunId,
              status: "cancelled",
              stats: aggregateStats,
            });
            const cancelled = await input.repository.getSyncRun(run.syncRunId);
            return {
              run: cancelled ?? run,
              warnings,
            };
          }

          const stage = stages[index];
          await input.repository.updateSyncStage({
            syncRunId: run.syncRunId,
            stage,
            progress: {
              stage_index: index + 1,
              stage_total: stages.length,
            },
          });

          const context: MetaSyncStageContext = {
            connectionId: input.connectionId,
            syncRunId: run.syncRunId,
            syncKind: input.syncKind,
            window: input.window ?? null,
            repository: input.repository,
            signal: input.signal,
            reportProgress: async (progress) => {
              await input.repository.updateSyncStage({
                syncRunId: run.syncRunId,
                stage,
                progress: {
                  current: progress.current,
                  total: progress.total ?? null,
                  message: progress.message ?? null,
                  details: progress.details ?? {},
                },
              });
            },
          };
          const result = await executeStage(stage, context, input);

          if (result.stats) {
            aggregateStats[stage] = result.stats;
          }
          if (result.warnings) {
            warnings.push(...result.warnings);
          }
          if (result.checkpoint) {
            await input.repository.saveCheckpoint({
              connectionId: input.connectionId,
              resourceKey: result.checkpoint.resourceKey,
              cursorState: result.checkpoint.cursorState,
              highWaterMark: result.checkpoint.highWaterMark,
              markSuccessful: true,
            });
          }
        }

        if (warnings.length > 0) {
          aggregateStats.warnings = warningsToJson(warnings);
        }

        await input.repository.finishSyncRun({
          syncRunId: run.syncRunId,
          status: warnings.length > 0 ? "partial" : "succeeded",
          stats: aggregateStats,
        });
        const completed = await input.repository.getSyncRun(run.syncRunId);
        return { run: completed ?? run, warnings };
      },
    );
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) {
      await input.repository.finishSyncRun({
        syncRunId: run.syncRunId,
        status: "cancelled",
      });
      throw error;
    }

    const failure = safeError(error);
    await input.repository.failSyncRun({
      syncRunId: run.syncRunId,
      errorCode: failure.code,
      errorMessage: failure.message,
      stats: failure.details ? { error_details: failure.details } : undefined,
    });
    throw error;
  }
}
