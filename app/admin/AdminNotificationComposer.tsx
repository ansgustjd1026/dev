"use client";

import { useMemo, useState } from "react";
import Button from "@/app/components/ui/Button";
import type { SiteLocale } from "@/lib/i18n/config";

type User = { id: string; email: string };
type Props = { users: User[]; locale: SiteLocale; disabled?: boolean };

export default function AdminNotificationComposer({ users, locale, disabled = false }: Props) {
  const isKorean = locale === "ko";
  const [target, setTarget] = useState<"selected" | "all">("selected");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [isSending, setIsSending] = useState(false);
  const allVisibleSelected = users.length > 0 && users.every((user) => selectedIds.has(user.id));
  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  function toggleUser(userId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleVisibleUsers() {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(users.map((user) => user.id)));
  }

  async function sendNotification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setIsSending(true);
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, userIds: [...selectedIds], title, message }),
      });
      const data = (await response.json().catch(() => null)) as { deliveredCount?: number; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? (isKorean ? "알림 발송에 실패했습니다." : "Could not send the notification."));
      setStatus(isKorean ? `${data?.deliveredCount ?? 0}개 계정에 발송했습니다.` : `Sent to ${data?.deliveredCount ?? 0} accounts.`);
      setTitle("");
      setMessage("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : isKorean ? "알림 발송에 실패했습니다." : "Could not send the notification.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{isKorean ? "관리자 알림 발송" : "Send admin notification"}</h2>
          <p className="mt-1 text-xs text-slate-500">{isKorean ? "선택한 회원 또는 전체 회원에게 알림을 보냅니다." : "Send a notification to selected members or every member."}</p>
        </div>
        {target === "selected" ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{isKorean ? `${selectedCount}명 선택` : `${selectedCount} selected`}</span> : null}
      </div>

      <form onSubmit={sendNotification} className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,0.75fr)_minmax(0,1.25fr)]">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex gap-2">
            <Button type="button" variant={target === "selected" ? "primary" : "secondary"} onClick={() => setTarget("selected")} className="!min-h-8 !px-3 !py-1.5 text-xs">{isKorean ? "선택 발송" : "Selected"}</Button>
            <Button type="button" variant={target === "all" ? "primary" : "secondary"} onClick={() => setTarget("all")} className="!min-h-8 !px-3 !py-1.5 text-xs">{isKorean ? "전체 발송" : "All users"}</Button>
          </div>
          {target === "selected" ? (
            <div className="mt-3 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white">
              <label className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleUsers} disabled={disabled || users.length === 0} />
                {isKorean ? "표시된 회원 전체" : "All shown members"}
              </label>
              {users.map((user) => (
                <label key={user.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                  <input type="checkbox" checked={selectedIds.has(user.id)} onChange={() => toggleUser(user.id)} disabled={disabled} />
                  <span className="truncate">{user.email}</span>
                </label>
              ))}
            </div>
          ) : <p className="mt-3 text-xs leading-5 text-amber-700">{isKorean ? "현재 등록된 모든 계정에 발송됩니다." : "This sends to every registered account."}</p>}
        </div>

        <div className="grid gap-2">
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required disabled={disabled || isSending} placeholder={isKorean ? "알림 제목" : "Notification title"} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10" />
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} required disabled={disabled || isSending} placeholder={isKorean ? "전달할 내용을 입력하세요" : "Write the message"} className="min-h-24 resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10" />
          <div className="flex items-center justify-between gap-3">
            <p className={`text-xs ${status.includes("실패") || status.includes("Could not") ? "text-red-600" : "text-slate-500"}`}>{status}</p>
            <Button type="submit" disabled={disabled || isSending || (target === "selected" && selectedCount === 0)} className="!min-h-9 !px-4 !py-2 text-xs">{isSending ? (isKorean ? "발송 중" : "Sending") : (isKorean ? "알림 발송" : "Send")}</Button>
          </div>
        </div>
      </form>
    </section>
  );
}
