import "server-only";

import { createAdminClient, hasSupabaseServiceRoleKey } from "@/lib/supabase/admin";

export async function recordOperationFailure({
  userId,
  projectId = null,
  stage,
  error,
  metadata = {},
}: {
  userId: string | null | undefined;
  projectId?: string | null;
  stage: string;
  error: unknown;
  metadata?: Record<string, unknown>;
}) {
  if (!userId || !hasSupabaseServiceRoleKey()) return;

  const message = error instanceof Error ? error.message : String(error);

  try {
    const { error: insertError } = await createAdminClient()
      .from("operation_failures")
      .insert({
        user_id: userId,
        project_id: projectId,
        stage: stage.slice(0, 80),
        message: message.slice(0, 2_000),
        metadata,
      });

    if (insertError) {
      console.warn("Operation failure log insert failed", insertError.message);
    }
  } catch (insertError) {
    console.warn("Operation failure logging failed", insertError);
  }
}

