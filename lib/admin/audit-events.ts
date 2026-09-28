import "server-only";

import { createAdminClient, hasSupabaseServiceRoleKey } from "@/lib/supabase/admin";

export type AdminAuditAction =
  | "plan_changed"
  | "credit_limit_changed"
  | "remaining_credits_changed"
  | "credits_reset"
  | "account_suspended"
  | "account_resumed"
  | "account_deleted";

export type AdminAuditEvent = {
  id: string;
  actorUserId: string | null;
  targetUserId: string;
  action: AdminAuditAction;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export async function recordAdminAuditEvent({
  actorUserId,
  targetUserId,
  action,
  metadata = {},
}: {
  actorUserId: string;
  targetUserId: string;
  action: AdminAuditAction;
  metadata?: Record<string, unknown>;
}) {
  if (!hasSupabaseServiceRoleKey()) return;

  try {
    const { error } = await createAdminClient().from("admin_audit_events").insert({
      actor_user_id: actorUserId,
      target_user_id: targetUserId,
      action,
      metadata,
    });

    if (error) {
      console.warn("Admin audit log insert failed", error.message);
    }
  } catch (error) {
    console.warn("Admin audit logging failed", error);
  }
}

export async function listRecentAdminAuditEvents(limit = 20) {
  const { data, error } = await createAdminClient()
    .from("admin_audit_events")
    .select("id, actor_user_id, target_user_id, action, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { events: [] as AdminAuditEvent[], error: error.message };

  return {
    events: (data ?? []).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const action = row.action;
      if (
        typeof row.id !== "string" ||
        typeof row.target_user_id !== "string" ||
        typeof row.created_at !== "string" ||
        ![
          "plan_changed",
          "credit_limit_changed",
          "remaining_credits_changed",
          "credits_reset",
          "account_suspended",
          "account_resumed",
          "account_deleted",
        ].includes(String(action))
      ) {
        return [];
      }

      return [{
        id: row.id,
        actorUserId: typeof row.actor_user_id === "string" ? row.actor_user_id : null,
        targetUserId: row.target_user_id,
        action: action as AdminAuditAction,
        metadata:
          row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {},
        createdAt: row.created_at,
      }];
    }),
    error: "",
  };
}
