"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthCard from "@/app/components/AuthCard";
import Button from "@/app/components/ui/Button";
import Input from "@/app/components/ui/Input";
import type { SiteLocale } from "@/lib/i18n/config";
import { getSiteText } from "@/lib/i18n/translations";

type Props = {
  locale: SiteLocale;
};

export default function LoginForm({ locale }: Props) {
  const router = useRouter();
  const t = getSiteText(locale).auth;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error ?? t.loginFailed);
        return;
      }

      const shouldConnectYouTube =
        window.localStorage.getItem("shate_connect_youtube_after_signup") ===
        "1";
      window.localStorage.removeItem("shate_connect_youtube_after_signup");

      if (shouldConnectYouTube) {
        // OAuth must use a full document navigation so the route can redirect to Google.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/api/youtube/connect";
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : t.loginError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard title={t.loginTitle} locale={locale}>
      <form onSubmit={handleLogin} className="space-y-4">
        <label className="block text-sm font-medium text-neutral-300">
          {t.username}
          <Input
            type="text"
            autoComplete="username"
            required
            className="mt-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>

        <label className="block text-sm font-medium text-neutral-300">
          {t.password}
          <Input
            type="password"
            placeholder={t.passwordPlaceholder}
            autoComplete="current-password"
            required
            className="mt-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {message && (
          <p className="rounded-2xl border border-red-400/30 bg-red-400/10 p-3 text-sm leading-6 text-red-100">
            {message}
          </p>
        )}

        <Button type="submit" fullWidth disabled={isSubmitting}>
          {isSubmitting ? t.loggingIn : t.login}
        </Button>
      </form>

      <div className="mt-6 flex justify-between text-sm text-neutral-400">
        <Link href="/forgot-password" className="text-white underline">
          {t.forgotPassword}
        </Link>
        <Link href="/signup" className="text-white underline">
          {t.signup}
        </Link>
      </div>
    </AuthCard>
  );
}
