"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

export function CopyIdButton({
  value,
  label = "Sao chép ID",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1_800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className="v2-copy-button"
      type="button"
      onClick={copy}
      aria-label={`${label}: ${value}`}
      title={copied ? "Đã sao chép" : label}
    >
      {copied ? (
        <Check aria-hidden="true" size={15} />
      ) : (
        <Copy aria-hidden="true" size={15} />
      )}
      <span className="sr-only">{copied ? "Đã sao chép" : label}</span>
    </button>
  );
}
