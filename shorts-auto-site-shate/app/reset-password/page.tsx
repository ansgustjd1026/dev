"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
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

export default function ResetPasswordPage() {
  const supabase = createClient();
  const router = useRouter();
  const locale = getClientLocale();
  const t = getSiteText(locale).auth;

  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage(
        locale === "ko" ? "비밀번호가 변경되었습니다." : "Password updated."
      );
      setTimeout(() => {
        router.push("/login");
      }, 1000);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard title={locale === "ko" ? "새 비밀번호" : "New password"} locale={locale}>
      <form onSubmit={handleUpdatePassword} className="space-y-4">
        <label className="block text-sm font-medium text-neutral-300">
          {t.password}
          <Input
            type="password"
            placeholder={locale === "ko" ? "6자 이상" : "At least 6 characters"}
            autoComplete="new-password"
            minLength={6}
            required
            className="mt-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
              ? "변경 중..."
              : "Updating..."
            : locale === "ko"
              ? "변경"
              : "Update"}
        </Button>
      </form>
    </AuthCard>
  );
}
