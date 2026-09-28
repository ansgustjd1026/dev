import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DeleteProjectButton from "./DeleteProjectButton";
import CreditFloatingWidget from "@/app/components/CreditFloatingWidget";
import DownloadVideoButton from "@/app/components/DownloadVideoButton";
import PlanUpgradeDialog from "@/app/components/PlanUpgradeDialog";
import AppHeader from "@/app/components/AppHeader";
import PageShell from "@/app/components/PageShell";
import Badge from "@/app/components/ui/Badge";
import LinkButton from "@/app/components/ui/LinkButton";
import AutoCreateButton from "./AutoCreateDialog";
import FinalVideoPreviewButton from "./FinalVideoPreviewButton";
import ProjectBulkSelection, {
  ProjectSelectCheckbox,
} from "./ProjectBulkSelection";
import ProjectActionsMenu from "./ProjectActionsMenu";
import VisualStyleTestButton from "./VisualStyleTestButton";
import {
  getCreditUsageSummary,
  type CreditUsageSummary,
} from "@/lib/credits/usage";
import { getUserPreferences } from "@/lib/preferences/server";
import { getSiteText } from "@/lib/i18n/translations";
import {
  createAdminClient,
  hasSupabaseServiceRoleKey,
} from "@/lib/supabase/admin";

type Project = {
  id: string;
  title: string | null;
  topic: string | null;
  final_video_url: string | null;
  source_video_name?: string | null;
  source_video_url?: string | null;
  status: string;
};

const PROJECT_LIST_LIMIT = 20;
const PROJECT_SELECT_COLUMNS =
  "id, title, topic, final_video_url, source_video_name, source_video_url, status";
const PROJECT_SELECT_COLUMNS_WITHOUT_SOURCE_VIDEO =
  "id, title, topic, final_video_url, status";

const STATUS_VARIANTS = {
  draft: "neutral",
  script_ready: "cyan",
  audio_ready: "indigo",
  background_selected: "fuchsia",
  final_ready: "amber",
  completed: "emerald",
} as const;

function getStatusLabel(status: string, t: ReturnType<typeof getSiteText>["dashboard"]) {
  if (status === "draft") return t.status.draft;
  if (status === "script_ready") return t.status.script_ready;
  if (status === "audio_ready") return t.status.audio_ready;
  if (status === "background_selected") return t.status.background_selected;
  if (status === "final_ready") return t.status.final_ready;
  if (status === "completed") return t.status.completed;

  return status;
}

function getProjectTitle(
  project: Project,
  t: ReturnType<typeof getSiteText>["dashboard"]
) {
  return (
    project.title ||
    project.source_video_name ||
    project.topic ||
    t.untitledProject
  );
}

function getWorkButtonLabel(status: string, t: ReturnType<typeof getSiteText>["dashboard"]) {
  if (status === "completed") return t.workButton.edit;
  return t.workButton.continue;
}

function getStatusVariant(status: string) {
  return STATUS_VARIANTS[status as keyof typeof STATUS_VARIANTS] ?? "neutral";
}

function isMissingSourceVideoColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message.toLowerCase()
      : "";
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";

  return code === "42703" || message.includes("source_video");
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const projectsPromise = (async () => {
    const result = await supabase
      .from("projects")
      .select(PROJECT_SELECT_COLUMNS)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .range(0, PROJECT_LIST_LIMIT - 1);

    if (!result.error || !isMissingSourceVideoColumnError(result.error)) {
      return result;
    }

    return supabase
      .from("projects")
      .select(PROJECT_SELECT_COLUMNS_WITHOUT_SOURCE_VIDEO)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .range(0, PROJECT_LIST_LIMIT - 1);
  })();

  const creditSummaryPromise = getCreditUsageSummary({
    userId: user.id,
    supabase,
  })
    .then((summary) => ({ summary, error: "" }))
    .catch((creditError: unknown) => ({
      summary: null as CreditUsageSummary | null,
      error: creditError instanceof Error ? creditError.message : "",
    }));

  const planPromise = supabase
    .from("user_plans")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();

  const youtubeConnectionPromise = (async () => {
    if (!hasSupabaseServiceRoleKey()) return null;

    try {
      const { data } = await createAdminClient()
        .from("youtube_connections")
        .select("channel_id")
        .eq("user_id", user.id)
        .maybeSingle<{ channel_id: string | null }>();

      return data;
    } catch {
      return null;
    }
  })();

  const backgroundVideosPromise = supabase.storage
    .from("background-videos")
    .list(user.id)
    .then(({ data, error }) => {
      if (error) return false;
      return Boolean(
        data?.some((item) => /\.(mp4|mov|webm)$/i.test(item.name))
      );
    })
    .catch(() => false);

  const [projectsResult, preferences, creditResult, planResult, youtubeConnection, hasBackgroundVideos] = await Promise.all([
    projectsPromise,
    getUserPreferences(),
    creditSummaryPromise,
    planPromise,
    youtubeConnectionPromise,
    backgroundVideosPromise,
  ]);
  const locale = preferences.locale;
  const { data: projects, error } = projectsResult;

  const projectList = (projects ?? []) as Project[];
  const text = getSiteText(locale);
  const t = text.dashboard;
  const creditSummary = creditResult.summary;
  const creditLoadFailed =
    locale === "ko"
      ? "크레딧 정보를 불러오지 못했습니다."
      : "Could not load credit information.";

  const creditSummaryError = creditResult.error ||
    (!creditSummary ? creditLoadFailed : "");
  const canDownload = planResult.data?.plan === "starter" || planResult.data?.plan === "pro";
  const isAutomationPlan =
    planResult.data?.plan === "starter" || planResult.data?.plan === "pro";
  const hasRequiredBackground =
    preferences.autoVisualMode !== "background" || hasBackgroundVideos;
  const canRunAutomation =
    isAutomationPlan && Boolean(youtubeConnection?.channel_id) && hasRequiredBackground;
  const autoCreateDisabledReason = !isAutomationPlan
    ? locale === "ko"
      ? "Starter 이상에서 사용할 수 있습니다."
      : "Available on Starter and Pro plans."
    : !youtubeConnection?.channel_id
      ? locale === "ko"
        ? "프로필에서 YouTube 채널을 먼저 연결해주세요."
        : "Connect a YouTube channel in Profile first."
      : locale === "ko"
        ? "설정된 내 배경 랜덤을 사용하려면 프로필에 배경 영상을 올려주세요."
        : "Upload a background video to use the saved random-background setting.";
  return (
    <PageShell
      className="px-4 py-4 sm:px-8 sm:py-6"
      contentClassName="mx-auto w-full"
      contentStyle={{ maxWidth: "var(--app-header-max-width)" }}
    >
      <AppHeader
        locale={locale}
        profileWidget={
          <CreditFloatingWidget
            summary={creditSummary}
            error={creditSummaryError}
            locale={locale}
          />
        }
      />

      <section className="mt-2">
        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {t.loadError} {error.message}
          </div>
        )}

        {!error && projectList.length === 0 && (
          <>
            <div className="mt-1 flex w-fit flex-wrap items-center gap-2">
              <LinkButton href="/create" className="gap-2 px-3.5 shadow-none">
                <span aria-hidden="true" className="text-lg leading-none">+</span>
                {t.createProject}
              </LinkButton>
              <div className="flex items-center">
                <AutoCreateButton
                  locale={locale}
                  disabled={!canRunAutomation}
                  disabledReason={autoCreateDisabledReason}
                  defaultMode={preferences.autoVisualMode}
                />
                <div
                  id="dashboard-auto-create-progress"
                  className="relative m-0 flex shrink-0 items-center [&:not(:empty)]:ml-2"
                />
              </div>
              {process.env.NODE_ENV !== "production" ? (
                <VisualStyleTestButton locale={locale} />
              ) : null}
            </div>
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
              <h3 className="text-[22px] font-semibold tracking-tight text-slate-950">
                {t.emptyTitle}
              </h3>

              <LinkButton href="/create" className="mt-5 px-4 py-2.5">
                {t.firstProject}
              </LinkButton>
            </div>
          </>
        )}

        {!error && projectList.length > 0 && (
          <ProjectBulkSelection
            projectIds={projectList.map((project) => project.id)}
            locale={locale}
            actions={
              <>
                <LinkButton href="/create" className="gap-2 px-3.5 shadow-none">
                  <span aria-hidden="true" className="text-lg leading-none">+</span>
                  {t.createProject}
                </LinkButton>
                <div className="flex items-center">
                  <AutoCreateButton
                    locale={locale}
                    disabled={!canRunAutomation}
                    disabledReason={autoCreateDisabledReason}
                    defaultMode={preferences.autoVisualMode}
                  />
                  <div
                    id="dashboard-auto-create-progress"
                    className="relative m-0 flex shrink-0 items-center [&:not(:empty)]:ml-2"
                  />
                </div>
                {process.env.NODE_ENV !== "production" ? (
                  <VisualStyleTestButton locale={locale} />
                ) : null}
              </>
            }
          >
          <div className="mt-3 grid gap-3">
            {projectList.map((project) => (
              <article
                key={project.id}
                className="group rounded-2xl border border-l-[3px] border-slate-200 border-l-slate-300 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:border-l-sky-500 hover:shadow-[0_12px_30px_rgba(15,23,42,0.06)]"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ProjectSelectCheckbox
                        projectId={project.id}
                        projectTitle={getProjectTitle(project, t)}
                        locale={locale}
                      />
                      <h3 className="truncate text-lg font-semibold text-slate-950">
                        {getProjectTitle(project, t)}
                      </h3>

                      <Badge variant={getStatusVariant(project.status)}>
                        {getStatusLabel(project.status, t)}
                      </Badge>
                    </div>

                    {project.topic && (
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                        <span className="font-medium text-slate-500">{t.topic}</span>{" "}
                        {project.topic}
                      </p>
                    )}

                    {project.source_video_url && (
                      <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cyan-800">
                          {t.sourceVideo}
                        </p>
                        <p className="mt-2 truncate text-sm text-slate-700">
                          {project.source_video_name ?? t.uploadedSourceVideo}
                        </p>
                      </div>
                    )}

                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <LinkButton
                      href={`/create?projectId=${project.id}`}
                      prefetch={false}
                      className="min-w-24 px-4"
                    >
                      {getWorkButtonLabel(project.status, t)}
                    </LinkButton>
                    <ProjectActionsMenu
                      label={locale === "ko" ? "프로젝트 메뉴" : "Project menu"}
                    >
                      {project.final_video_url ? (
                        <>
                          <FinalVideoPreviewButton
                            videoUrl={project.final_video_url}
                            title={getProjectTitle(project, t)}
                            locale={locale}
                          />
                          {canDownload ? (
                            <DownloadVideoButton
                              videoUrl={project.final_video_url}
                              fileName={`${getProjectTitle(project, t)}.mp4`}
                              loadingLabel={locale === "ko" ? "준비 중" : "Preparing"}
                              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {t.download}
                            </DownloadVideoButton>
                          ) : (
                            <PlanUpgradeDialog
                              locale={locale}
                              triggerLabel={t.download}
                              feature="download"
                              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                            />
                          )}
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="w-full rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400"
                        >
                          {t.incomplete}
                        </button>
                      )}
                      <DeleteProjectButton
                        projectId={project.id}
                        labels={text.create.deleteProject}
                      />
                    </ProjectActionsMenu>
                  </div>
                </div>
              </article>
            ))}
          </div>
          </ProjectBulkSelection>
        )}
      </section>
    </PageShell>
  );
}
