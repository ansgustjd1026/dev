"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import AuthCard from "@/app/components/AuthCard";
import Button from "@/app/components/ui/Button";
import Input from "@/app/components/ui/Input";
import { SITE_LOCALE_COOKIE, type SiteLocale } from "@/lib/i18n/config";
import { getSiteText } from "@/lib/i18n/translations";

function getClientLocale(): SiteLocale {
  if (typeof document === "undefined") return "ko";

  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .some((item) => item === `${SITE_LOCALE_COOKIE}=en`)
    ? "en"
    : "ko";
}

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const locale = getClientLocale();
  const t = getSiteText(locale).auth;

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage(
        locale === "ko"
          ? "비밀번호 재설정 이메일을 보냈습니다."
          : "Password reset email sent."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard title={t.forgotPassword} locale={locale}>
      <form onSubmit={handleReset} className="space-y-4">
        <label className="block text-sm font-medium text-neutral-300">
          {locale === "ko" ? "이메일" : "Email"}
          <Input
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="mt-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        {message && (
          <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-6 text-neutral-200">
            {message}
          </p>
        )}

        <Button type="submit" fullWidth disabled={isSubmitting}>
          {isSubmitting
            ? locale === "ko"
              ? "보내는 중..."
              : "Sending..."
            : locale === "ko"
              ? "이메일 보내기"
              : "Send email"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-neutral-400">
        <Link href="/login" className="text-white underline">
          {t.login}
        </Link>
      </p>
    </AuthCard>
  );
}
