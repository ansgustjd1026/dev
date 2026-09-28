import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  enforceRateLimit,
  getRequestLimitResponse,
  isStringWithinLimit,
  readJsonBody,
} from "@/lib/security/api-limits";

type LoginPayload = {
  username?: unknown;
  password?: unknown;
};

function normalizeUsername(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const body = (await readJsonBody(request, 8 * 1024)) as LoginPayload;
    const username = normalizeUsername(body.username);
    const password = typeof body.password === "string" ? body.password : "";

    if (!isStringWithinLimit(username, 20) || !/^[a-z0-9_]{3,20}$/.test(username)) {
      return NextResponse.json(
        { error: "아이디 또는 비밀번호를 확인해주세요." },
        { status: 400 }
      );
    }

    if (!isStringWithinLimit(password, 200)) {
      return NextResponse.json(
        { error: "아이디 또는 비밀번호를 확인해주세요." },
        { status: 400 }
      );
    }

    const rateLimitResponse = enforceRateLimit({
      key: `login:${username}`,
      limit: 8,
      windowMs: 60_000,
    });

    if (rateLimitResponse) return rateLimitResponse;

    const supabase = await createClient();
    const { data: emailData, error: emailError } = await supabase.rpc(
      "get_email_for_username",
      {
        p_username: username,
      }
    );

    if (emailError || typeof emailData !== "string" || !emailData) {
      return NextResponse.json(
        { error: "아이디 또는 비밀번호를 확인해주세요." },
        { status: 400 }
      );
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: emailData,
      password,
    });

    if (error) {
      return NextResponse.json(
        { error: "아이디 또는 비밀번호를 확인해주세요." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    const message =
      error instanceof Error ? error.message : "로그인 중 오류가 발생했습니다.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
