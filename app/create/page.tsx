import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CreateProjectForm from "./CreateProjectForm";
import PageShell from "@/app/components/PageShell";
import { getUserPreferences } from "@/lib/preferences/server";
import {
  createAdminClient,
  hasSupabaseServiceRoleKey,
} from "@/lib/supabase/admin";

type Props = {
  searchParams?: Promise<{
    projectId?: string;
    auto?: string;
    visual?: string;
  }>;
};

export default async function CreatePage({ searchParams }: Props) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const youtubeConnectionPromise = (async () => {
    if (!hasSupabaseServiceRoleKey()) {
      return null as {
        channel_id: string | null;
        channel_title: string | null;
      } | null;
    }

    const admin = createAdminClient();

    try {
      const { data } = await admin
        .from("youtube_connections")
        .select("channel_id, channel_title")
        .eq("user_id", user.id)
        .maybeSingle<{
          channel_id: string | null;
          channel_title: string | null;
        }>();

      return data;
    } catch {
      return null;
    }
  })();

  const planPromise = supabase
    .from("user_plans")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();

  const [params, preferences, youtubeConnection, planResult] = await Promise.all([
    searchParams,
    getUserPreferences(),
    youtubeConnectionPromise,
    planPromise,
  ]);
  const locale = preferences.locale;
  const projectId = params?.projectId ?? "";
  const shouldStartProAutomation = params?.auto === "1" && !projectId;
  const autoVisualMode =
    params?.visual === "background" || params?.visual === "images"
      ? params.visual
      : preferences.autoVisualMode;
  const youtubeChannelTitle = youtubeConnection?.channel_title ?? "";
  const isYouTubeConnected = Boolean(youtubeConnection?.channel_id);
  const canPublishToYouTube =
    planResult.data?.plan === "starter" || planResult.data?.plan === "pro";
  const canRunAutomation =
    (planResult.data?.plan === "starter" || planResult.data?.plan === "pro") &&
    isYouTubeConnected;
  const initialYouTubePublishEvent = await (async () => {
    if (!projectId || !hasSupabaseServiceRoleKey()) return null;

    try {
      const { data } = await createAdminClient()
        .from("youtube_publish_events")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; status: string }>();

      return data ?? null;
    } catch {
      return null;
    }
  })();

  return (
    <PageShell
      className="px-3 py-3 sm:px-8 sm:py-6"
      contentClassName="mx-auto w-full"
      contentStyle={{ maxWidth: "var(--app-header-max-width)" }}
    >
      <CreateProjectForm
        initialProjectId={projectId}
        initialLocale={locale}
        initialYouTubeChannelTitle={youtubeChannelTitle}
        initialIsYouTubeConnected={isYouTubeConnected}
        initialCanPublishToYouTube={canPublishToYouTube}
        initialCanRunAutomation={canRunAutomation}
        initialStartProAutomation={shouldStartProAutomation}
        initialScriptLanguage={preferences.scriptLanguage}
        initialScriptDurationSeconds={preferences.scriptDurationSeconds}
        initialVoice={preferences.voice === "random" ? "nova" : preferences.voice}
        initialAutoVoice={preferences.voice}
        initialBackgroundPlaybackSpeed={
          preferences.backgroundPlaybackSpeed === "fit"
            ? 1
            : Number(preferences.backgroundPlaybackSpeed)
        }
        initialBackgroundSpeedFit={preferences.backgroundPlaybackSpeed === "fit"}
        initialBackgroundReversed={preferences.backgroundDirection === "reverse"}
        initialYouTubePrivacy={preferences.youtubePrivacy}
        initialYouTubePinnedComment={preferences.youtubePinnedComment}
        initialYouTubePublishEvent={initialYouTubePublishEvent}
        initialAutoVisualMode={autoVisualMode}
        initialVideoVisualStyle={preferences.videoVisualStyle}
      />
    </PageShell>
  );
}
