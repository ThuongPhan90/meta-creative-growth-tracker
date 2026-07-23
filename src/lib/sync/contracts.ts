import type { TrackerRepository } from "@/lib/db/repository";
import type {
  DatabaseId,
  JsonObject,
  JsonValue,
  SyncKind,
  SyncRunRecord,
} from "@/lib/db/types";

export type SyncStageName = "validate" | "assets" | "insights";

export interface SyncWindow {
  dateFrom: string;
  dateTo: string;
}

export interface SyncWarning {
  code: string;
  message: string;
  resource?: string;
}

export interface SyncStageResult {
  stats?: JsonObject;
  warnings?: readonly SyncWarning[];
  checkpoint?: {
    resourceKey: string;
    cursorState?: JsonObject;
    highWaterMark?: string | null;
  };
}

export interface SyncProgressUpdate {
  current: number;
  total?: number;
  message?: string;
  details?: JsonObject;
}

export interface MetaSyncStageContext {
  connectionId: DatabaseId;
  syncRunId: DatabaseId;
  syncKind: SyncKind;
  window: SyncWindow | null;
  repository: TrackerRepository;
  signal?: AbortSignal;
  reportProgress(update: SyncProgressUpdate): Promise<void>;
}

/**
 * Boundary between database orchestration and src/lib/meta.
 *
 * A Meta adapter owns Graph pagination, normalization, action mapping and API
 * retries. It writes normalized batches through `context.repository`. The
 * orchestrator owns exclusivity, run state, checkpoints, failure handling and
 * partial-success semantics.
 */
export interface MetaSyncAdapter {
  validate(context: MetaSyncStageContext): Promise<SyncStageResult>;
  syncAssets(context: MetaSyncStageContext): Promise<SyncStageResult>;
  syncInsights(context: MetaSyncStageContext): Promise<SyncStageResult>;
}

export interface RunSyncInput {
  connectionId: DatabaseId;
  syncKind: SyncKind;
  triggerSource: "manual" | "cron" | "setup" | "retry" | "system";
  requestKey?: string | null;
  window?: SyncWindow | null;
  adapter: MetaSyncAdapter;
  repository: TrackerRepository;
  signal?: AbortSignal;
}

export interface RunSyncResult {
  run: SyncRunRecord;
  warnings: SyncWarning[];
}

export interface SyncErrorShape {
  code: string;
  message: string;
  retryable: boolean;
  details?: JsonValue;
}

export class SyncStageError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: JsonValue;

  constructor(error: SyncErrorShape) {
    super(error.message);
    this.name = "SyncStageError";
    this.code = error.code;
    this.retryable = error.retryable;
    this.details = error.details;
  }
}
