"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthCard from "@/app/components/AuthCard";
import Button from "@/app/components/ui/Button";
import Input from "@/app/components/ui/Input";
import type { SiteLocale } from "@/lib/i18n/config";
import { getSiteText } from "@/lib/i18n/translations";

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

type Props = {
  locale: SiteLocale;
};

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export default function SignupForm({ locale }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const t = getSiteText(locale).auth;

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [connectYouTubeAfterSignup, setConnectYouTubeAfterSignup] =
    useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedUsername = normalizeUsername(username);
  const isUsernameValid = USERNAME_PATTERN.test(normalizedUsername);
  const isPasswordValid = password.length >= 6 && /[^A-Za-z0-9]/.test(password);
  const isPasswordConfirmInvalid =
    passwordConfirm.length > 0 && password !== passwordConfirm;
  const visiblePasswordError =
    passwordError || (password.length > 0 && !isPasswordValid ? t.passwordRule : "");
  const visibleUsernameError =
    usernameError || (username.length > 0 && !isUsernameValid ? t.usernameRule : "");

  function getSignupErrorMessage(messageText: string) {
    const normalizedMessage = messageText.toLowerCase();

    if (normalizedMessage.includes("email rate limit exceeded")) {
      return t.emailRateLimit;
    }

    if (normalizedMessage.includes("user already registered")) {
      return t.alreadyRegistered;
    }

    return messageText;
  }

  function handleUsernameChange(value: string) {
    setUsername(value);
    setUsernameError("");
  }

  function handlePasswordChange(value: string) {
    setPassword(value);

    if (!value) {
      setPasswordError("");
      return;
    }

    setPasswordError(
      value.length >= 6 && /[^A-Za-z0-9]/.test(value) ? "" : t.passwordRule
    );
  }

  async function checkUsernameAvailable() {
    const { data, error } = await supabase.rpc("is_username_available", {
      p_username: normalizedUsername,
    });

    if (error) {
      throw new Error(t.usernameSetupRequired);
    }

    return data === true;
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setUsernameError("");

    if (!isUsernameValid) {
      setUsernameError(t.usernameRule);
      return;
    }

    if (!isPasswordValid) {
      setPassword("");
      setPasswordConfirm("");
      setPasswordError(t.passwordResetRule);
      return;
    }

    if (password !== passwordConfirm) {
      setMessage(t.passwordMismatch);
      return;
    }

    setIsSubmitting(true);

    try {
      const isAvailable = await checkUsernameAvailable();

      if (!isAvailable) {
        setUsernameError(t.usernameTaken);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            username: normalizedUsername,
          },
        },
      });

      if (error) {
        setMessage(getSignupErrorMessage(error.message));
        return;
      }

      if (data.session) {
        window.localStorage.removeItem("shate_connect_youtube_after_signup");
        if (connectYouTubeAfterSignup) {
          // OAuth must use a full document navigation so the route can redirect to Google.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/api/youtube/connect";
        } else {
          router.push("/dashboard");
        }
      } else {
        if (connectYouTubeAfterSignup) {
          window.localStorage.setItem(
            "shate_connect_youtube_after_signup",
            "1"
          );
        } else {
          window.localStorage.removeItem("shate_connect_youtube_after_signup");
        }
        setMessage(
          connectYouTubeAfterSignup
            ? locale === "ko"
              ? "이메일 인증 후 로그인하면 YouTube 연결을 이어서 진행할 수 있습니다."
              : "Verify your email, then sign in to continue connecting YouTube."
            : t.verificationSent
        );
      }
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : t.signupError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard title={t.signupTitle} locale={locale}>
      <form onSubmit={handleSignup} className="space-y-4">
        <label className="block text-sm font-medium text-neutral-300">
          {t.username}
          <Input
            type="text"
            autoComplete="username"
            required
            className="mt-2"
            value={username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            placeholder={t.usernamePlaceholder}
            aria-invalid={Boolean(visibleUsernameError)}
          />
          {visibleUsernameError && (
            <p className="mt-2 text-xs font-medium text-red-400">
              {visibleUsernameError}
            </p>
          )}
        </label>

        <label className="flex items-start gap-3 rounded-2xl border border-cyan-200/20 bg-cyan-200/[0.04] px-4 py-3 text-sm text-neutral-200">
          <input
            type="checkbox"
            checked={connectYouTubeAfterSignup}
            onChange={(event) => setConnectYouTubeAfterSignup(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-cyan-200"
          />
          <span>
            <span className="block font-semibold">
              {locale === "ko" ? "가입 후 YouTube 연결" : "Connect YouTube after signup"}
            </span>
            <span className="mt-1 block text-xs leading-5 text-neutral-400">
              {locale === "ko"
                ? "가입이 완료되면 YouTube 채널 연결 화면으로 이동합니다. 나중에 프로필에서 연결할 수도 있습니다."
                : "After signup, continue to connect a YouTube channel. You can also do this later from Profile."}
            </span>
          </span>
        </label>

        <label className="block text-sm font-medium text-neutral-300">
          {t.password}
          <Input
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(visiblePasswordError)}
            required
            className="mt-2"
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
          />
          {visiblePasswordError && (
            <p className="mt-2 text-xs font-medium text-red-400">
              {visiblePasswordError}
            </p>
          )}
        </label>

        <label className="block text-sm font-medium text-neutral-300">
          {t.passwordConfirm}
          <Input
            type="password"
            autoComplete="new-password"
            aria-invalid={isPasswordConfirmInvalid}
            required
            className="mt-2"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
          {isPasswordConfirmInvalid && (
            <p className="mt-2 text-xs font-medium text-red-400">
              {t.passwordMismatchShort}
            </p>
          )}
        </label>

        <label className="block text-sm font-medium text-neutral-300">
          {t.email}
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
          {isSubmitting ? t.signingUp : t.signup}
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
