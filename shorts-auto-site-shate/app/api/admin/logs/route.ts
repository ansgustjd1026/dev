import { NextResponse } from "next/server";
import { getCurrentAdminUser, isCurrentAdminVerified } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestLimitResponse, readJsonBody } from "@/lib/security/api-limits";

type LogKind = "operation_failures" | "admin_audit_events";

type DeleteLogsPayload = {
  kind?: unknown;
  scope?: unknown;
  ids?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isLogKind(value: unknown): value is LogKind {
  return value === "operation_failures" || value === "admin_audit_events";
}

function getIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && UUID_PATTERN.test(item)))];
}

async function requireVerifiedAdmin() {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser || !(await isCurrentAdminVerified())) {
    return NextResponse.json({ error: "관리자 비밀번호 확인이 필요합니다." }, { status: 403 });
  }

  return null;
}

export async function DELETE(request: Request) {
  const deniedResponse = await requireVerifiedAdmin();
  if (deniedResponse) return deniedResponse;

  try {
    const body = (await readJsonBody(request, 16 * 1024)) as DeleteLogsPayload;
    if (!isLogKind(body.kind)) {
      return NextResponse.json({ error: "삭제할 로그 종류를 확인해주세요." }, { status: 400 });
    }

    const ids = getIds(body.ids);
    if (body.scope !== "all" && body.scope !== "selected") {
      return NextResponse.json({ error: "삭제 범위를 확인해주세요." }, { status: 400 });
    }
    if (body.scope === "selected" && ids.length === 0) {
      return NextResponse.json({ error: "삭제할 기록을 선택해주세요." }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    let query = adminSupabase.from(body.kind).delete({ count: "exact" });

    if (body.scope === "selected") {
      query = query.in("id", ids);
    } else {
      query = query.not("id", "is", null);
    }

    const { count, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deletedCount: count ?? 0 });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "로그 삭제 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
