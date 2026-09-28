"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/app/components/ui/Button";
import type { SiteLocale } from "@/lib/i18n/config";
import { ADMIN_PLANS, type AdminPlanId } from "@/lib/admin/plans";

type Props = {
  userId: string;
  userEmail: string;
  currentPlan: AdminPlanId;
  currentRemainingCredits?: number;
  planStatus: string;
  isSelf: boolean;
  disabled: boolean;
  locale: SiteLocale;
};

function getText(locale: SiteLocale) {
  return locale === "ko"
    ? {
        planUpdateFailed: "플랜 변경에 실패했습니다.",
        planUpdated: "플랜을 변경했습니다.",
        deleteConfirm: (email: string) =>
          `${email} 계정을 삭제할까요? 이 작업은 되돌리기 어렵습니다.`,
        deleteFailed: "계정 삭제에 실패했습니다.",
        deleted: "계정을 삭제했습니다.",
        resetConfirm: (email: string) =>
          `${email} 계정의 이번 달 크레딧 사용량을 0으로 초기화할까요?`,
        resetFailed: "크레딧 초기화에 실패했습니다.",
        resetDone: (count: number) =>
          `이번 달 크레딧을 초기화했습니다. 삭제된 로그: ${count}개`,
        saving: "변경 중...",
        updatePlan: "플랜 변경",
        resetting: "초기화 중...",
        resetCredits: "크레딧 초기화",
        remainingCredits: "남은 크레딧",
        remainingCreditsUpdated: "남은 크레딧을 변경했습니다.",
        remainingCreditsFailed: "남은 크레딧 변경에 실패했습니다.",
        updateRemainingCredits: "크레딧 저장",
        deleting: "삭제 중...",
        deleteAccount: "계정 삭제",
        selfProtected: "현재 로그인한 관리자 계정은 삭제하거나 정지할 수 없습니다.",
        suspendConfirm: (email: string) => `${email} 계정을 정지할까요? 제작과 업로드가 즉시 차단됩니다.`,
        resumeConfirm: (email: string) => `${email} 계정 정지를 해제할까요?`,
        suspensionFailed: "계정 상태 변경에 실패했습니다.",
        suspended: "계정을 정지했습니다.",
        resumed: "계정 정지를 해제했습니다.",
        suspending: "정지 중...",
        resuming: "해제 중...",
        suspend: "계정 정지",
        resume: "정지 해제",
      }
    : {
        planUpdateFailed: "Could not update the plan.",
        planUpdated: "Plan updated.",
        deleteConfirm: (email: string) =>
          `Delete ${email}? This action is difficult to undo.`,
        deleteFailed: "Could not delete the account.",
        deleted: "Account deleted.",
        resetConfirm: (email: string) =>
          `Reset this month's credit usage for ${email} to zero?`,
        resetFailed: "Could not reset credits.",
        resetDone: (count: number) =>
          `Monthly credits reset. Deleted logs: ${count}.`,
        saving: "Saving...",
        updatePlan: "Update plan",
        resetting: "Resetting...",
        resetCredits: "Reset credits",
        remainingCredits: "Remaining credits",
        remainingCreditsUpdated: "Remaining credits updated.",
        remainingCreditsFailed: "Could not update remaining credits.",
        updateRemainingCredits: "Save credits",
        deleting: "Deleting...",
        deleteAccount: "Delete account",
        selfProtected: "You cannot delete or suspend the currently signed-in admin account.",
        suspendConfirm: (email: string) => `Suspend ${email}? Creation and publishing will be blocked immediately.`,
        resumeConfirm: (email: string) => `Resume ${email}?`,
        suspensionFailed: "Could not change account status.",
        suspended: "Account suspended.",
        resumed: "Account resumed.",
        suspending: "Suspending...",
        resuming: "Resuming...",
        suspend: "Suspend account",
        resume: "Resume account",
      };
}

export default function AdminUserActions({
  userId,
  userEmail,
  currentPlan,
  currentRemainingCredits,
  planStatus,
  isSelf,
  disabled,
  locale,
}: Props) {
  const router = useRouter();
  const text = getText(locale);
  const [selectedPlan, setSelectedPlan] = useState<AdminPlanId>(currentPlan);
  const [remainingCredits, setRemainingCredits] = useState(
    currentRemainingCredits === undefined ? "" : String(currentRemainingCredits)
  );
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingCredits, setIsResettingCredits] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [isSavingRemainingCredits, setIsSavingRemainingCredits] = useState(false);
  const isSuspended = planStatus === "suspended";

  async function updatePlan() {
    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, plan: selectedPlan }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? text.planUpdateFailed);

      setMessage(text.planUpdated);
      router.refresh();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : text.planUpdateFailed);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteUser() {
    if (!window.confirm(text.deleteConfirm(userEmail))) return;

    setIsDeleting(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? text.deleteFailed);

      setMessage(text.deleted);
      router.replace("/admin");
      router.refresh();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : text.deleteFailed);
    } finally {
      setIsDeleting(false);
    }
  }

  async function resetCredits() {
    if (!window.confirm(text.resetConfirm(userEmail))) return;

    setIsResettingCredits(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? text.resetFailed);

      setMessage(text.resetDone(data.deletedCount ?? 0));
      router.refresh();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : text.resetFailed);
    } finally {
      setIsResettingCredits(false);
    }
  }

  async function toggleSuspension() {
    const nextStatus = isSuspended ? "active" : "suspended";
    const confirmed = window.confirm(
      isSuspended ? text.resumeConfirm(userEmail) : text.suspendConfirm(userEmail)
    );
    if (!confirmed) return;

    setIsChangingStatus(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, status: nextStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? text.suspensionFailed);

      setMessage(isSuspended ? text.resumed : text.suspended);
      router.refresh();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : text.suspensionFailed);
    } finally {
      setIsChangingStatus(false);
    }
  }

  async function saveRemainingCredits() {
    const nextRemaining = Number(remainingCredits);
    if (!Number.isInteger(nextRemaining) || nextRemaining < 0 || nextRemaining > 100_000) {
      setMessage(locale === "ko" ? "남은 크레딧은 0부터 100,000 사이의 정수여야 합니다." : "Remaining credits must be an integer from 0 to 100,000.");
      return;
    }

    setIsSavingRemainingCredits(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, remainingCredits: nextRemaining }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? text.remainingCreditsFailed);

      setMessage(text.remainingCreditsUpdated);
      router.refresh();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : text.remainingCreditsFailed);
    } finally {
      setIsSavingRemainingCredits(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <div className="col-span-2 grid grid-cols-2 gap-1.5">
        <select
          value={selectedPlan}
          disabled={disabled || isSaving || isResettingCredits || isDeleting || isChangingStatus || isSavingRemainingCredits}
          onChange={(event) => setSelectedPlan(event.target.value as AdminPlanId)}
          className="h-8 min-h-8 min-w-32 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 disabled:opacity-50"
        >
          {ADMIN_PLANS.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.label}
            </option>
          ))}
        </select>

        <Button
          type="button"
          variant="secondary"
          disabled={disabled || isSaving || isResettingCredits || isDeleting || isChangingStatus || isSavingRemainingCredits}
          onClick={updatePlan}
          className="!min-h-8 !h-8 !rounded-md !px-3 !py-1.5 text-xs"
        >
          {isSaving ? text.saving : text.updatePlan}
        </Button>
      </div>

      <div className="col-span-2 grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || isSaving || isResettingCredits || isDeleting || isChangingStatus || isSavingRemainingCredits}
          onClick={resetCredits}
          className="!min-h-8 !h-8 !rounded-md !px-3 !py-1.5 text-xs text-amber-700 hover:bg-amber-100"
        >
          {isResettingCredits ? text.resetting : text.resetCredits}
        </Button>

        <Button
          type="button"
          variant="danger"
          disabled={disabled || isSelf || isSaving || isResettingCredits || isDeleting || isChangingStatus || isSavingRemainingCredits}
          onClick={deleteUser}
          className="!min-h-8 !h-8 !rounded-md !px-3 !py-1.5 text-xs"
        >
          {isDeleting ? text.deleting : text.deleteAccount}
        </Button>
      </div>

      <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <label className="sr-only" htmlFor={`remaining-credits-${userId}`}>{text.remainingCredits}</label>
        <input
          id={`remaining-credits-${userId}`}
          type="number"
          min="0"
          max="100000"
          step="1"
          value={remainingCredits}
          placeholder={text.remainingCredits}
          disabled={disabled || isSaving || isResettingCredits || isDeleting || isChangingStatus || isSavingRemainingCredits}
          onChange={(event) => setRemainingCredits(event.target.value)}
          className="h-8 min-w-0 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 disabled:opacity-50"
          aria-label={text.remainingCredits}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || !remainingCredits || isSaving || isResettingCredits || isDeleting || isChangingStatus || isSavingRemainingCredits}
          onClick={saveRemainingCredits}
          className="!min-h-8 !h-8 !rounded-md !px-3 !py-1.5 text-xs"
        >
          {isSavingRemainingCredits ? text.saving : text.updateRemainingCredits}
        </Button>
      </div>

      <Button
        type="button"
        variant={isSuspended ? "secondary" : "danger"}
        disabled={disabled || isSelf || isSaving || isResettingCredits || isDeleting || isChangingStatus || isSavingRemainingCredits}
        onClick={toggleSuspension}
        className="col-span-2 !min-h-8 !h-8 !rounded-md !px-3 !py-1.5 text-xs"
      >
        {isChangingStatus
          ? isSuspended
            ? text.resuming
            : text.suspending
          : isSuspended
            ? text.resume
            : text.suspend}
      </Button>

      {message && <p className="col-span-2 text-xs text-slate-600">{message}</p>}
      {isSelf && <p className="col-span-2 text-xs text-slate-500">{text.selfProtected}</p>}
    </div>
  );
}
