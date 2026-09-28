"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/app/components/ui/Button";
import Input from "@/app/components/ui/Input";
import Surface from "@/app/components/ui/Surface";
import type { SiteLocale } from "@/lib/i18n/config";

export default function AdminPasswordGate({ locale }: { locale: SiteLocale }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const ko = locale === "ko";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/admin/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Verification failed.");
      }
      setPassword("");
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : ko
            ? "관리자 확인에 실패했습니다."
            : "Verification failed."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface className="mx-auto mt-6 max-w-md p-6 sm:p-7">
      <h2 className="text-xl font-semibold text-slate-950">
        {ko ? "관리자 확인" : "Admin verification"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {ko
          ? "회원 관리에 들어가기 전에 현재 계정의 비밀번호를 다시 입력해주세요."
          : "Re-enter your current account password to manage members."}
      </p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={ko ? "현재 비밀번호" : "Current password"}
          aria-label={ko ? "현재 비밀번호" : "Current password"}
          disabled={pending}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" fullWidth disabled={!password || pending}>
          {pending ? (ko ? "확인 중" : "Verifying") : ko ? "확인" : "Verify"}
        </Button>
      </form>
    </Surface>
  );
}
