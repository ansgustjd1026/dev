"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export default function TossBridgePage() {
  const [error, setError] = useState("");

  useEffect(() => {
    const finishSignIn = async () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = fragment.get("access_token") ?? "";
      const refreshToken = fragment.get("refresh_token") ?? "";
      const nextPath = getSafeNextPath(fragment.get("next"));

      window.history.replaceState(null, "", "/toss-bridge");

      if (!accessToken || !refreshToken) {
        setError("로그인 정보를 전달받지 못했습니다.");
        return;
      }

      const { error: sessionError } = await createClient().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        setError("로그인 연결이 만료되었습니다. 다시 시도해주세요.");
        return;
      }

      window.location.replace(nextPath);
    };

    void finishSignIn();
  }, []);

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <h1>{error ? "연결하지 못했습니다" : "Shate를 여는 중입니다"}</h1>
        <p>{error || "프로젝트 편집기를 준비하고 있습니다."}</p>
        {error ? <a className="button primary" href="/login">로그인</a> : null}
      </section>
    </main>
  );
}
