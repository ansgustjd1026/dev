import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTossLoginUser } from "@/lib/toss/login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ORIGIN_PATTERN = /^https:\/\/[a-z0-9-]+\.apps\.tossmini\.com$/i;
const LOCAL_ORIGIN_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGIN_PATTERN.test(origin) || LOCAL_ORIGIN_PATTERN.test(origin) ? origin : "";
  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function tossEmail(userKey: string) {
  return `toss-${userKey}@accounts.shate.local`;
}

function tossUsername(userKey: string) {
  return `toss${userKey}`.slice(0, 20);
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { authorizationCode?: unknown; referrer?: unknown };
    const authorizationCode = typeof body.authorizationCode === "string" ? body.authorizationCode.trim() : "";
    const referrer = body.referrer === "SANDBOX" ? "SANDBOX" : body.referrer === "DEFAULT" ? "DEFAULT" : null;
    if (!authorizationCode || authorizationCode.length > 4096 || !referrer) {
      return NextResponse.json({ error: "토스 로그인 응답을 확인해주세요." }, { status: 400, headers: corsHeaders(request) });
    }

    const { userKey } = await getTossLoginUser({ authorizationCode, referrer });
    const admin = createAdminClient();
    const { data: existing, error: existingError } = await admin
      .from("toss_login_accounts")
      .select("user_id")
      .eq("toss_user_key", userKey)
      .maybeSingle<{ user_id: string }>();
    if (existingError) throw new Error("토스 계정 연결 정보를 조회하지 못했습니다. SQL 설정을 확인해주세요.");

    let userId = existing?.user_id;
    const email = tossEmail(userKey);
    if (!userId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { username: tossUsername(userKey), auth_provider: "toss" },
        app_metadata: { auth_provider: "toss" },
      });
      if (createError || !created.user) throw new Error("Shate 계정을 만들지 못했습니다.");
      userId = created.user.id;

      const { error: linkError } = await admin.from("toss_login_accounts").insert({
        toss_user_key: userKey,
        user_id: userId,
      });
      if (linkError) throw new Error("토스 계정을 연결하지 못했습니다.");
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) throw new Error("앱 세션을 준비하지 못했습니다.");

    return NextResponse.json({ tokenHash }, { headers: corsHeaders(request) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "토스 로그인을 완료하지 못했습니다." },
      { status: 500, headers: corsHeaders(request) },
    );
  }
}
