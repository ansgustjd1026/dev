import { NextResponse } from "next/server";
import {
  ADMIN_VERIFICATION_COOKIE,
  createAdminVerificationToken,
  getCurrentAdminUser,
} from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import {
  enforceRateLimit,
  getRequestLimitResponse,
  readJsonBody,
} from "@/lib/security/api-limits";

type Payload = { password?: unknown };

export async function POST(request: Request) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser?.email) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  try {
    const rateLimitResponse = enforceRateLimit({
      key: `admin-verify:${adminUser.id}`,
      limit: 5,
      windowMs: 5 * 60_000,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = (await readJsonBody(request, 4 * 1024)) as Payload;
    const password = typeof body.password === "string" ? body.password : "";
    if (!password) {
      return NextResponse.json({ error: "비밀번호를 입력해주세요." }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: adminUser.email,
      password,
    });
    if (error) {
      return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const token = createAdminVerificationToken(adminUser.id);
    if (!token) {
      return NextResponse.json(
        { error: "관리자 확인을 준비하지 못했습니다." },
        { status: 503 }
      );
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_VERIFICATION_COOKIE, token, {
      httpOnly: true,
      maxAge: 15 * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    const message = error instanceof Error ? error.message : "관리자 확인에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
