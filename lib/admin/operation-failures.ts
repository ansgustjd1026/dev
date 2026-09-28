import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type AdminOperationFailure = {
  id: string;
  userId: string;
  projectId: string | null;
  stage: string;
  message: string;
  createdAt: string;
};

export async function listRecentOperationFailures(limit = 20) {
  const { data, error } = await createAdminClient()
    .from("operation_failures")
    .select("id, user_id, project_id, stage, message, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { failures: [] as AdminOperationFailure[], error: error.message };

  return {
    failures: (data ?? []).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (
        typeof row.id !== "string" ||
        typeof row.user_id !== "string" ||
        typeof row.stage !== "string" ||
        typeof row.message !== "string" ||
        typeof row.created_at !== "string"
      ) {
        return [];
      }
      return [{
        id: row.id,
        userId: row.user_id,
        projectId: typeof row.project_id === "string" ? row.project_id : null,
        stage: row.stage,
        message: row.message,
        createdAt: row.created_at,
      }];
    }),
    error: "",
  };
}
