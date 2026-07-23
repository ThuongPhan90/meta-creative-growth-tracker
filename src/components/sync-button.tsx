"use client";

import { RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export function SyncButton({
  kind = "incremental",
  autoStart = false,
  label = "Đồng bộ lại",
}: {
  kind?: "full" | "assets" | "insights" | "incremental";
  autoStart?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(
    autoStart ? "Đang chuẩn bị đồng bộ lần đầu…" : null,
  );

  const run = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setMessage("Đang đọc dữ liệu Meta. Có thể mất vài phút…");

    try {
      const response = await fetch(`/api/sync?kind=${kind}`, {
        method: "POST",
        headers: {
          "X-Idempotency-Key": `${kind}:${crypto.randomUUID()}`,
        },
      });
      const payload = (await response.json()) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Không thể đồng bộ Meta.");
      }
      setMessage(payload.message ?? "Đồng bộ hoàn tất.");
      if (autoStart) router.replace("/assets");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Không thể đồng bộ Meta.",
      );
    } finally {
      setSyncing(false);
    }
  }, [autoStart, kind, router, syncing]);

  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    void run();
  }, [autoStart, run]);

  return (
    <div className="sync-control">
      <button
        className="button button--secondary"
        type="button"
        onClick={() => void run()}
        disabled={syncing}
      >
        <RefreshCcw
          aria-hidden="true"
          className={syncing ? "spin" : undefined}
          size={16}
        />
        {syncing ? "Đang đồng bộ" : label}
      </button>
      {message ? (
        <span className="sync-control__message" role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}
