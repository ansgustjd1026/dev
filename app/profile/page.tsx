import { redirect } from "next/navigation";
import BackgroundLibraryManager from "./BackgroundLibraryManager";
import ProfileManagementTabs from "./ProfileManagementTabs";
import YouTubeProfileSettings from "./YouTubeProfileSettings";
import YouTubePublishHistory, {
  type YouTubePublishEvent,
} from "./YouTubePublishHistory";
import SubscriptionSettings from "./SubscriptionSettings";
import SettingsForm from "@/app/settings/SettingsForm";
import AppHeader from "@/app/components/AppHeader";
import CreditUsageCard from "@/app/components/CreditUsageCard";
import CreditFloatingWidget from "@/app/components/CreditFloatingWidget";
import LogoutButton from "@/app/dashboard/LogoutButton";
import PageShell from "@/app/components/PageShell";
import InfoCard from "@/app/components/ui/InfoCard";
import LinkButton from "@/app/components/ui/LinkButton";
import Surface from "@/app/components/ui/Surface";
import { createClient } from "@/lib/supabase/server";
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
import { isAdminUser } from "@/lib/admin/auth";

type Props = {
  searchParams?: Promise<{
    youtube?: string;
    message?: string;
    tab?: string;
  }>;
};

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return "-";

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function getYouTubeConnectionMessage(
  value: string | undefined,
  fallbackMessage: string | undefined,
  locale: string
) {
  const isKo = locale === "ko";

  if (value === "connected") {
    return isKo ? "YouTube 채널이 연동되었습니다." : "YouTube connected.";
  }

  if (value === "missing-config") {
    return isKo
      ? "Google OAuth 설정이 필요합니다."
      : "Google OAuth configuration is required.";
  }

  if (value === "invalid-state") {
    return isKo
      ? "연동 요청을 확인하지 못했습니다. 다시 시도해주세요."
      : "Could not verify the connection request. Try again.";
  }

  if (value === "denied") {
    return isKo
      ? "YouTube 연동이 취소되었습니다."
      : "YouTube connection was canceled.";
  }

  if (value === "no-channel") {
    return isKo
      ? "YouTube 채널이 없습니다. YouTube에서 채널을 만든 뒤 다시 연결해주세요."
      : "This Google account has no YouTube channel. Create one, then connect again.";
  }

  if (value === "error") {
    return (
      fallbackMessage ||
      (isKo ? "YouTube 연동에 실패했습니다." : "YouTube connection failed.")
    );
  }

  return "";
}

export default async function ProfilePage({ searchParams }: Props) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const creditSummaryPromise = getCreditUsageSummary({
    userId: user.id,
    supabase,
  })
    .then((summary) => ({ summary, error: "" }))
    .catch((error: unknown) => ({
      summary: null as CreditUsageSummary | null,
      error: error instanceof Error ? error.message : "",
    }));
  const profilePromise = supabase
    .from("user_profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle();
  const subscriptionPromise = supabase
    .from("billing_subscriptions")
    .select("plan, status, current_period_end, cancel_at_period_end")
    .eq("user_id", user.id)
    .in("status", ["active", "past_due"])
    .maybeSingle()
    .then(({ data, error }) => (error ? null : data));
  const youtubeDataPromise = (async () => {
    if (!hasSupabaseServiceRoleKey()) {
      return {
        connection: null as {
          channel_id: string | null;
          channel_title: string | null;
        } | null,
        events: [] as YouTubePublishEvent[],
        eventsLoadFailed: false,
      };
    }

    const admin = createAdminClient();

    try {
      const [connectionResult, eventsResult] = await Promise.all([
        admin
          .from("youtube_connections")
          .select("channel_id, channel_title")
          .eq("user_id", user.id)
          .maybeSingle<{
            channel_id: string | null;
            channel_title: string | null;
          }>(),
        admin
          .from("youtube_publish_events")
          .select(
            "id, youtube_video_id, video_url, title, status, error_message, created_at"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      return {
        connection: connectionResult.error ? null : connectionResult.data,
        events: (eventsResult.data ?? []) as YouTubePublishEvent[],
        eventsLoadFailed: Boolean(eventsResult.error),
      };
    } catch {
      return {
        connection: null as {
          channel_id: string | null;
          channel_title: string | null;
        } | null,
        events: [] as YouTubePublishEvent[],
        eventsLoadFailed: true,
      };
    }
  })();

  const [preferences, params, creditResult, profileResult, subscription, youtubeData, isAdmin] =
    await Promise.all([
      getUserPreferences(),
      searchParams,
      creditSummaryPromise,
      profilePromise,
      subscriptionPromise,
      youtubeDataPromise,
      isAdminUser(user),
    ]);
  const locale = preferences.locale;
  const username =
    typeof profileResult.data?.username === "string"
      ? profileResult.data.username
      : "";
  const youtubeChannelTitle = youtubeData.connection?.channel_title ?? "";
  const youtubeChannelId = youtubeData.connection?.channel_id ?? "";
  const isYouTubeConnected = Boolean(youtubeData.connection);
  const youtubePublishEvents = youtubeData.events;
  const youtubePublishEventsLoadFailed = youtubeData.eventsLoadFailed;
  const text = getSiteText(locale);
  const t = text.profile;
  const isYouTubeConnectConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
  const youtubeConnectionMessage = getYouTubeConnectionMessage(
    params?.youtube,
    params?.message,
    locale
  );
  const creditLoadFailed =
    locale === "ko"
      ? "크레딧 정보를 불러오지 못했습니다."
      : "Could not load credit information.";
  const dateLocale = locale === "ko" ? "ko-KR" : "en-US";
  const managementTabs = {
    credits: locale === "ko" ? "크레딧" : "Credits",
    subscription: locale === "ko" ? "구독" : "Subscription",
    youtube: locale === "ko" ? "YouTube" : "YouTube",
    posts: locale === "ko" ? "게시 이력" : "Posts",
    backgrounds: locale === "ko" ? "배경 영상" : "Backgrounds",
    settings: locale === "ko" ? "설정" : "Settings",
  };

  const creditSummary = creditResult.summary;
  const creditSummaryError = creditResult.error ||
    (!creditSummary ? creditLoadFailed : "");

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

      <section className="mt-5 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Surface as="aside" className="p-6">
          <div className="flex items-center gap-4">
            <div className="app-primary grid h-12 w-12 place-items-center rounded-xl bg-slate-950 text-lg font-bold text-white shadow-sm">
              {(user.email ?? "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold">{t.accountInfo}</h2>
              <p className="mt-1 truncate text-sm text-neutral-400">
                {username || user.email || "-"}
              </p>
            </div>
          </div>

          <div className="mt-7 space-y-4 text-sm">
            <InfoCard
              label="ID"
              value={username || "-"}
            />

            <InfoCard
              label="Email"
              value={
                <p className="break-all">
                  {user.email ?? "-"}
                </p>
              }
            />

            <InfoCard
              label="YouTube"
              value={youtubeChannelTitle || "-"}
            />

            <InfoCard
              label="User ID"
              value={
                <p className="break-all font-mono text-xs text-neutral-300">
                  {user.id}
                </p>
              }
            />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <InfoCard
                label={t.lastSignIn}
                value={
                  <p>
                    {formatDate(user.last_sign_in_at, dateLocale)}
                  </p>
                }
              />

              <InfoCard
                label={t.created}
                value={
                  <p>
                    {formatDate(user.created_at, dateLocale)}
                  </p>
                }
              />
            </div>

            {isAdmin ? (
              <LinkButton
                href="/admin"
                variant="secondary"
                className="w-full justify-center"
              >
                {locale === "ko" ? "관리자" : "Admin"}
              </LinkButton>
            ) : null}

            <LogoutButton
              label={text.auth.logout}
              className="w-full justify-center"
            />
          </div>
        </Surface>

        <div className="space-y-5">
          <ProfileManagementTabs
            tabs={[
              {
                id: "credits",
                label: managementTabs.credits,
                content: (
                  <CreditUsageCard
                    summary={creditSummary}
                    error={creditSummaryError}
                    locale={locale}
                  />
                ),
              },
              {
                id: "subscription",
                label: managementTabs.subscription,
                content: (
                  <SubscriptionSettings
                    subscription={subscription ? {
                      plan: subscription.plan === "pro" ? "pro" : "starter",
                      status: subscription.status === "past_due" ? "past_due" : "active",
                      currentPeriodEnd: subscription.current_period_end,
                      cancelAtPeriodEnd: subscription.cancel_at_period_end,
                    } : null}
                    locale={locale}
                  />
                ),
              },
              {
                id: "youtube",
                label: managementTabs.youtube,
                content: (
                  <YouTubeProfileSettings
                    channelTitle={youtubeChannelTitle}
                    channelId={youtubeChannelId}
                    isConnected={isYouTubeConnected}
                    isConfigured={isYouTubeConnectConfigured}
                    connectionMessage={youtubeConnectionMessage}
                    locale={locale}
                  />
                ),
              },
              {
                id: "posts",
                label: managementTabs.posts,
                content: (
                  <YouTubePublishHistory
                    events={youtubePublishEvents}
                    loadFailed={youtubePublishEventsLoadFailed}
                    locale={locale}
                  />
                ),
              },
              {
                id: "backgrounds",
                label: managementTabs.backgrounds,
                content: <BackgroundLibraryManager locale={locale} />,
              },
              {
                id: "settings",
                label: managementTabs.settings,
                content: (
                  <Surface className="p-5 sm:p-7">
                    <SettingsForm initialPreferences={preferences} />
                  </Surface>
                ),
              },
            ]}
            initialTab={params?.tab === "settings" ? "settings" : undefined}
          />
        </div>
      </section>
    </PageShell>
  );
}
