import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import {
  createAdminClient,
  hasSupabaseServiceRoleKey,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let isYouTubeConnected = false;

  if (hasSupabaseServiceRoleKey()) {
    try {
      const { data } = await createAdminClient()
        .from("youtube_connections")
        .select("channel_id")
        .eq("user_id", user.id)
        .maybeSingle<{ channel_id: string | null }>();

      isYouTubeConnected = Boolean(data?.channel_id);
    } catch {
      isYouTubeConnected = false;
    }
  }

  const notifications: Array<Record<string, unknown>> = isYouTubeConnected
    ? []
    : [
          {
            id: "connect-youtube-account",
            type: "action",
            title: "Google 계정 연동",
            message: "YouTube 게시를 사용하려면 Google 계정을 연결해주세요.",
            actionHref: "/api/youtube/connect",
            actionLabel: "연동",
            createdAt: user.created_at,
          },
        ];

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("user_notifications")
      .select("id, title, message, action_href, action_label, created_at")
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!error) {
      notifications.unshift(
        ...(data ?? []).flatMap((item) => {
          if (!item?.id || !item.title || !item.message) return [];
          return [{
            id: item.id,
            type: item.action_href && item.action_label ? "action" : "message",
            title: item.title,
            message: item.message,
            actionHref: item.action_href ?? undefined,
            actionLabel: item.action_label ?? undefined,
            createdAt: typeof item.created_at === "string" ? item.created_at : undefined,
            persistent: true,
          }];
        })
      );
    }
  } catch {
    // Keep account notifications available even before the admin notification SQL is installed.
  }

  return NextResponse.json({ notifications });
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedApiUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { notificationIds?: unknown } | null;
  const notificationIds = Array.isArray(body?.notificationIds)
    ? body.notificationIds.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, 30)
    : [];
  if (notificationIds.length === 0) return NextResponse.json({ ok: true });

  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .in("id", notificationIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "알림을 읽음 처리하지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getAuthenticatedApiUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { notificationId?: unknown } | null;
  const notificationId = typeof body?.notificationId === "string" ? body.notificationId : "";
  if (!notificationId) return NextResponse.json({ error: "알림을 확인해주세요." }, { status: 400 });

  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("user_notifications")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", user.id)
      .is("dismissed_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "알림을 삭제하지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
