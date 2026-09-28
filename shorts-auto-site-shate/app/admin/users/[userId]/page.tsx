import { notFound, redirect } from "next/navigation";
import AppHeader from "@/app/components/AppHeader";
import CreditUsageCard from "@/app/components/CreditUsageCard";
import PageShell from "@/app/components/PageShell";
import InfoCard from "@/app/components/ui/InfoCard";
import Surface from "@/app/components/ui/Surface";
import ProfileManagementTabs from "@/app/profile/ProfileManagementTabs";
import YouTubePublishHistory, {
  type YouTubePublishEvent,
} from "@/app/profile/YouTubePublishHistory";
import type { SiteLocale } from "@/lib/i18n/config";
import { getSiteLocale } from "@/lib/i18n/server";
import { getCurrentAdminUser, isCurrentAdminVerified } from "@/lib/admin/auth";
import { getAdminUserProfile } from "@/lib/admin/users";
import {
  getAdminApiUsageSummary,
  type AdminApiUsageSummary,
} from "@/lib/admin/api-usage";
import { createAdminClient, hasSupabaseServiceRoleKey } from "@/lib/supabase/admin";
import type { CreditAction } from "@/lib/credits/rules";
import { PLAN_CATALOG } from "@/lib/plans/catalog";
import AdminUserActions from "../../AdminUserActions";

type Props = { params: Promise<{ userId: string }> };

function formatDate(value: string | null | undefined, locale: SiteLocale) {
  if (!value) return "-";

  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return "-";
  const megabytes = bytes / 1024 / 1024;
  return megabytes < 1 ? `${Math.max(0.1, megabytes).toFixed(1)}MB` : `${megabytes.toFixed(1)}MB`;
}

function displayStorageFileName(fileName: string) {
  if (!fileName.startsWith("u_")) return fileName;
  const dotIndex = fileName.lastIndexOf(".");
  const encodedName = dotIndex > 2 ? fileName.slice(2, dotIndex) : fileName.slice(2);

  try {
    const normalized = encodedName.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return fileName;
  }
}

function getPeriod() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

function makeCreditSummary(
  monthlyLimit: number,
  usedCredits: number,
  events: Array<{ action: string; credits_charged: number }>,
  remainingCreditsOverride?: number
) {
  const actions: CreditAction[] = [
    "script_generate",
    "tts_generate",
    "transcribe_audio",
    "render_video",
    "render_image_video",
  ];
  const actionCounts = Object.fromEntries(actions.map((action) => [action, 0])) as Record<
    CreditAction,
    number
  >;
  const actionCredits = Object.fromEntries(actions.map((action) => [action, 0])) as Record<
    CreditAction,
    number
  >;

  for (const event of events) {
    const action = event.action as CreditAction;
    if (!actions.includes(action)) continue;
    actionCounts[action] += 1;
    actionCredits[action] += event.credits_charged;
  }

  const { periodStart, periodEnd } = getPeriod();

  return {
    monthlyLimit,
    usedCredits,
    remainingCredits: remainingCreditsOverride ?? Math.max(0, monthlyLimit - usedCredits),
    periodStart,
    periodEnd,
    actionCounts,
    actionCredits,
  };
}

function ReadOnlyYouTubeCard({
  channelTitle,
  locale,
}: {
  channelTitle: string;
  locale: SiteLocale;
}) {
  const connected = Boolean(channelTitle);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">YouTube</h2>
      <p className="mt-1 text-sm text-slate-600">
        {locale === "ko"
          ? "이 계정의 YouTube 연결 상태입니다."
          : "This account's YouTube connection status."}
      </p>
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-900">
            {connected ? channelTitle : locale === "ko" ? "연결 안 됨" : "Not connected"}
          </span>
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
              connected
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            {connected ? (locale === "ko" ? "연결됨" : "Connected") : "-"}
          </span>
        </div>
      </div>
    </section>
  );
}

function ReadOnlyBackgroundCard({
  locale,
  videos,
  loadError,
}: {
  locale: SiteLocale;
  videos: Array<{ name: string; url: string; size: number | null }>;
  loadError: boolean;
}) {
  const isKorean = locale === "ko";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-950">{isKorean ? "배경 영상" : "Backgrounds"}</h2>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {videos.length}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {isKorean ? "관리자 읽기 전용 목록입니다." : "Read-only administrator view."}
      </p>
      {loadError ? (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {isKorean ? "배경 영상 목록을 불러오지 못했습니다." : "Could not load background videos."}
        </p>
      ) : videos.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
          {isKorean ? "업로드한 배경 영상이 없습니다." : "No background videos uploaded."}
        </p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {videos.map((video) => (
            <article key={video.url} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <video
                src={video.url}
                controls
                muted
                preload="metadata"
                className="aspect-[9/16] w-full bg-slate-950 object-contain"
              />
              <div className="p-3">
                <p className="truncate text-sm font-semibold text-slate-950" title={video.name}>{video.name}</p>
                <p className="mt-1 text-xs text-slate-500">{formatFileSize(video.size)}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function UserApiCostOverview({
  summary,
  plan,
  usedCredits,
  locale,
}: {
  summary: AdminApiUsageSummary;
  plan: keyof typeof PLAN_CATALOG;
  usedCredits: number;
  locale: SiteLocale;
}) {
  const isKorean = locale === "ko";
  const number = new Intl.NumberFormat(isKorean ? "ko-KR" : "en-US");
  const grossRevenue = PLAN_CATALOG[plan].monthlyPriceKrw;
  const netRevenue = grossRevenue / 1.1 - grossRevenue * 0.033;
  const apiCostKrw = Math.round(summary.estimatedCostUsd * 1_400);
  const contribution = Math.round(netRevenue - apiCostKrw);
  const marginPercent = grossRevenue > 0
    ? Math.round((contribution / grossRevenue) * 100)
    : null;
  const costPerCredit = usedCredits > 0 ? apiCostKrw / usedCredits : 0;

  return (
    <section className="mt-3 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            {isKorean ? "실제 API 원가" : "Measured API cost"}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {isKorean
              ? "이번 달 사용량 · 환율 1달러 1,400원"
              : "This month · USD 1 = KRW 1,400"}
          </p>
        </div>
        {summary.available ? (
          <strong className="text-xl text-slate-950">
            {number.format(apiCostKrw)}{isKorean ? "원" : " KRW"}
          </strong>
        ) : null}
      </div>

      {summary.available ? (
        <dl className="grid grid-cols-2 divide-x divide-y divide-slate-200 sm:grid-cols-4 sm:divide-y-0">
          <div className="px-4 py-3">
            <dt className="text-xs text-slate-500">{isKorean ? "호출" : "Calls"}</dt>
            <dd className="mt-1 text-base font-semibold text-slate-950">{number.format(summary.calls)}</dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-xs text-slate-500">{isKorean ? "크레딧당 원가" : "Cost / credit"}</dt>
            <dd className="mt-1 text-base font-semibold text-slate-950">{costPerCredit.toFixed(1)}{isKorean ? "원" : " KRW"}</dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-xs text-slate-500">{isKorean ? "가용 매출" : "Net revenue"}</dt>
            <dd className="mt-1 text-base font-semibold text-slate-950">{number.format(Math.round(netRevenue))}{isKorean ? "원" : " KRW"}</dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-xs text-slate-500">{isKorean ? "추정 잔액" : "Contribution"}</dt>
            <dd className={`mt-1 text-base font-semibold ${contribution >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {number.format(contribution)}{isKorean ? "원" : " KRW"}
              {marginPercent !== null ? ` · ${marginPercent}%` : ""}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="px-4 py-3 text-sm text-amber-700">
          {isKorean
            ? "Supabase에서 api_usage_events.sql을 실행하면 원가가 표시됩니다."
            : "Run api_usage_events.sql in Supabase to display costs."}
        </p>
      )}
    </section>
  );
}

export default async function AdminUserProfilePage({ params }: Props) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) redirect("/dashboard");
  if (!(await isCurrentAdminVerified())) redirect("/admin");

  const [{ userId }, locale] = await Promise.all([params, getSiteLocale()]);
  if (!hasSupabaseServiceRoleKey()) redirect("/admin");

  let profile;
  try {
    profile = await getAdminUserProfile(userId);
  } catch {
    notFound();
  }

  const admin = createAdminClient();
  const [connectionResult, eventsResult, backgroundVideosResult, apiUsageSummary] = await Promise.all([
    admin
      .from("youtube_connections")
      .select("channel_title")
      .eq("user_id", profile.id)
      .maybeSingle<{ channel_title: string | null }>(),
    admin
      .from("youtube_publish_events")
      .select("id, youtube_video_id, video_url, title, status, error_message, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(5),
    admin.storage.from("background-videos").list(profile.id, {
      limit: 100,
      sortBy: { column: "name", order: "asc" },
    }),
    getAdminApiUsageSummary(profile.id),
  ]);

  const isSelf = profile.id === adminUser.id;
  const text = locale === "ko"
    ? { profile: "프로필", account: "계정 정보", id: "사용자 ID", email: "이메일", joined: "가입일", lastLogin: "최근 로그인", credits: "크레딧", youtube: "YouTube", posts: "게시 이력", backgrounds: "배경 영상", adminActions: "관리자 작업", members: "회원 목록", actionHelp: "요금제 변경, 크레딧 초기화, 계정 정지 또는 삭제", logout: "로그아웃" }
    : { profile: "Profile", account: "Account information", id: "User ID", email: "Email", joined: "Joined", lastLogin: "Last sign-in", credits: "Credits", youtube: "YouTube", posts: "Posts", backgrounds: "Backgrounds", adminActions: "Admin actions", members: "Members", actionHelp: "Change plan, reset credits, suspend, or delete the account.", logout: "Log out" };

  const creditSummary = makeCreditSummary(
    profile.monthlyCreditLimit,
    Math.max(0, profile.monthlyCreditLimit - profile.remainingCreditsThisMonth),
    profile.monthlyCreditEvents,
    profile.remainingCreditsThisMonth
  );
  const youtubeEvents = (eventsResult.data ?? []) as YouTubePublishEvent[];
  const backgroundVideos = (backgroundVideosResult.data ?? [])
    .filter((item) => /\.(mp4|mov|webm)$/i.test(item.name))
    .map((item) => {
      const path = `${profile.id}/${item.name}`;
      const { data } = admin.storage.from("background-videos").getPublicUrl(path);
      return {
        name: displayStorageFileName(item.name),
        url: data.publicUrl,
        size: typeof item.metadata?.size === "number" ? item.metadata.size : null,
      };
    });

  return (
    <PageShell
      className="px-4 py-4 sm:px-8 sm:py-6"
      contentClassName="mx-auto w-full"
      contentStyle={{ maxWidth: "var(--app-header-max-width)" }}
    >
      <AppHeader
        locale={locale}
        mode="admin"
        action={{ href: "/admin", label: text.members }}
      />

      <section className="mt-5 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Surface as="aside" className="p-6">
          <div className="flex items-center gap-4">
            <div className="app-primary grid h-12 w-12 place-items-center rounded-xl bg-slate-950 text-lg font-bold text-white shadow-sm">
              {(profile.email || "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-slate-950">{text.account}</h2>
              <p className="mt-1 truncate text-sm text-slate-600">{profile.email}</p>
            </div>
          </div>

          <div className="mt-7 space-y-4 text-sm">
            <InfoCard label={text.email} value={profile.email} />
            <InfoCard label={text.id} value={<p className="break-all font-mono text-xs">{profile.id}</p>} />
            <InfoCard label={text.joined} value={formatDate(profile.createdAt, locale)} />
            <InfoCard label={text.lastLogin} value={formatDate(profile.lastSignInAt, locale)} />
            <div className="border-t border-slate-200 pt-4">
              <p className="mb-2 text-xs font-semibold text-slate-500">{text.adminActions}</p>
              <p className="mb-3 text-xs text-slate-500">{text.actionHelp}</p>
              <AdminUserActions
                userId={profile.id}
                userEmail={profile.email}
                currentPlan={profile.plan}
                currentRemainingCredits={profile.remainingCreditsThisMonth}
                planStatus={profile.planStatus}
                isSelf={isSelf}
                disabled={false}
                locale={locale}
              />
            </div>
          </div>
        </Surface>

        <div className="space-y-5">
          <ProfileManagementTabs
            tabs={[
              {
                id: "credits",
                label: text.credits,
                content: (
                  <>
                    <CreditUsageCard summary={creditSummary} error="" locale={locale} />
                    <UserApiCostOverview
                      summary={apiUsageSummary}
                      plan={profile.plan}
                      usedCredits={profile.usedCreditsThisMonth}
                      locale={locale}
                    />
                  </>
                ),
              },
              {
                id: "youtube",
                label: text.youtube,
                content: <ReadOnlyYouTubeCard channelTitle={connectionResult.data?.channel_title ?? ""} locale={locale} />,
              },
              {
                id: "posts",
                label: text.posts,
                content: <YouTubePublishHistory events={youtubeEvents} loadFailed={Boolean(eventsResult.error)} locale={locale} readOnly />,
              },
              {
                id: "backgrounds",
                label: text.backgrounds,
                content: (
                  <ReadOnlyBackgroundCard
                    locale={locale}
                    videos={backgroundVideos}
                    loadError={Boolean(backgroundVideosResult.error)}
                  />
                ),
              },
            ]}
          />
        </div>
      </section>
    </PageShell>
  );
}
