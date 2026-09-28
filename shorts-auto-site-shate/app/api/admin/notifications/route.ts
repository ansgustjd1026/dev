import { NextResponse } from "next/server";
import { getCurrentAdminUser, isCurrentAdminVerified } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { readJsonBody, getRequestLimitResponse } from "@/lib/security/api-limits";

type NotificationPayload = {
  target?: unknown;
  userIds?: unknown;
  title?: unknown;
  message?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireAdmin() {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) return { adminUser: null, response: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }) };
  if (!(await isCurrentAdminVerified())) {
    return { adminUser: null, response: NextResponse.json({ error: "관리자 비밀번호 확인이 필요합니다." }, { status: 403 }) };
  }
  return { adminUser, response: null };
}

async function listAllUserIds() {
  const supabase = createAdminClient();
  const ids: string[] = [];
  let page = 1;
  const perPage = 1_000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data.users ?? [];
    ids.push(...users.map((user) => user.id));
    if (users.length < perPage) return ids;
    page += 1;
  }
}

export async function POST(request: Request) {
  const { adminUser, response } = await requireAdmin();
  if (response) return response;

  try {
    const body = (await readJsonBody(request, 16 * 1024)) as NotificationPayload;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const target = body.target === "all" ? "all" : body.target === "selected" ? "selected" : "";

    if (!target || !title || !message || title.length > 100 || message.length > 1_000) {
      return NextResponse.json({ error: "대상, 제목(100자 이내), 내용(1,000자 이내)을 확인해주세요." }, { status: 400 });
    }

    const selectedIds = Array.isArray(body.userIds)
      ? [...new Set(body.userIds.filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))].slice(0, 1_000)
      : [];
    const userIds = target === "all" ? await listAllUserIds() : selectedIds;
    if (userIds.length === 0) {
      return NextResponse.json({ error: "발송할 계정을 선택해주세요." }, { status: 400 });
    }

    const supabase = createAdminClient();
    for (let start = 0; start < userIds.length; start += 500) {
      const rows = userIds.slice(start, start + 500).map((userId) => ({
        user_id: userId,
        sender_user_id: adminUser!.id,
        title,
        message,
      }));
      const { error } = await supabase.from("user_notifications").insert(rows);
      if (error) {
        return NextResponse.json({
          error: "알림 테이블을 확인할 수 없습니다. Supabase SQL Editor에서 supabase/admin_notifications.sql을 실행해주세요.",
          detail: error.message,
        }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, deliveredCount: userIds.length });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;
    return NextResponse.json({ error: error instanceof Error ? error.message : "알림 발송 중 오류가 발생했습니다." }, { status: 500 });
  }
}
