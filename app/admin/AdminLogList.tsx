"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/app/components/ui/Button";
import type { SiteLocale } from "@/lib/i18n/config";

type LogKind = "operation_failures" | "admin_audit_events";

export type AdminLogItem = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  href?: string;
  hrefLabel?: string;
  tone?: "danger" | "neutral";
};

export default function AdminLogList({
  kind,
  items,
  locale,
}: {
  kind: LogKind;
  items: AdminLogItem[];
  locale: SiteLocale;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | "all" | null>(null);
  const [error, setError] = useState("");
  const ko = locale === "ko";

  async function remove(ids: string[] | "all") {
    if (ids === "all") {
      const confirmation = ko
        ? `기록 ${items.length}개를 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.`
        : `Delete all ${items.length} log entries? This cannot be undone.`;
      if (!window.confirm(confirmation)) return;
    }

    setPending(ids === "all" ? "all" : ids[0] ?? null);
    setError("");
    try {
      const response = await fetch("/api/admin/logs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, scope: ids === "all" ? "all" : "selected", ids: ids === "all" ? [] : ids }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : ko ? "기록을 삭제하지 못했습니다." : "Could not delete logs.");
      }
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : ko ? "기록을 삭제하지 못했습니다." : "Could not delete logs.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={items.length === 0 || pending !== null}
          onClick={() => remove("all")}
          className="!min-h-8 !rounded-md !px-3 !py-1.5 text-xs"
        >
          {pending === "all" ? (ko ? "삭제 중" : "Deleting") : ko ? "전체 삭제" : "Delete all"}
        </Button>
      </div>

      {error ? <p className="border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">{error}</p> : null}

      <div className="divide-y divide-slate-200">
        {items.map((item) => (
          <div key={item.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950">{item.title}</p>
              <p className={`mt-0.5 line-clamp-2 text-sm leading-5 ${item.tone === "danger" ? "text-red-700" : "text-slate-500"}`}>
                {item.detail}
              </p>
            </div>
            <div className="flex items-center gap-3 sm:justify-end">
              <p className="text-xs text-slate-500">{item.timestamp}</p>
              {item.href && item.hrefLabel ? (
                <Link
                  href={item.href}
                  className="inline-flex min-h-8 items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-sm transition hover:border-slate-950 hover:bg-slate-100"
                >
                  {item.hrefLabel}
                </Link>
              ) : null}
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => remove([item.id])}
                aria-label={ko ? "기록 삭제" : "Delete log"}
                title={ko ? "기록 삭제" : "Delete"}
                className="grid size-8 place-items-center rounded-md text-lg leading-none text-slate-400 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
