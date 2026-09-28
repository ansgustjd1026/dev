import { redirect } from "next/navigation";
import PageShell from "@/app/components/PageShell";
import AppHeader from "@/app/components/AppHeader";
import Badge from "@/app/components/ui/Badge";
import LinkButton from "@/app/components/ui/LinkButton";
import Surface from "@/app/components/ui/Surface";
import type { SiteLocale } from "@/lib/i18n/config";
import { getSiteLocale } from "@/lib/i18n/server";
import { getCurrentAdminUser, isCurrentAdminVerified } from "@/lib/admin/auth";
import { hasSupabaseServiceRoleKey } from "@/lib/supabase/admin";
import { listAdminUsers, type AdminUserListItem } from "@/lib/admin/users";
import {
  getAdminApiUsageSummary,
  type AdminApiUsageSummary,
} from "@/lib/admin/api-usage";
import {
  listRecentOperationFailures,
  type AdminOperationFailure,
} from "@/lib/admin/operation-failures";
import {
  listRecentAdminAuditEvents,
  type AdminAuditEvent,
} from "@/lib/admin/audit-events";
import AdminUserActions from "./AdminUserActions";
import AdminUserSearchForm from "./AdminUserSearchForm";
import AdminPasswordGate from "./AdminPasswordGate";
import AdminLogList, { type AdminLogItem } from "./AdminLogList";
import AdminNotificationComposer from "./AdminNotificationComposer";
import AdminPlanCreditSettings from "./AdminPlanCreditSettings";
import { getPlanCreditSettings } from "@/lib/admin/plan-credit-settings";

type Props = {
  searchParams?: Promise<{ email?: string }>;
};

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

function UserRow({
  user,
  currentAdminId,
  hasServiceKey,
  locale,
}: {
  user: AdminUserListItem;
  currentAdminId: string;
  hasServiceKey: boolean;
  locale: SiteLocale;
}) {
  const isSelf = user.id === currentAdminId;
  const text =
    locale === "ko"
      ? {
          currentAdmin: "현재 관리자",
          confirmed: "인증됨",
          pending: "미인증",
          suspended: "정지됨",
          joined: "가입",
          lastLogin: "최근 로그인",
          view: "프로필 보기",
        }
      : {
          currentAdmin: "Current admin",
          confirmed: "Verified",
          pending: "Unverified",
          suspended: "Suspended",
          joined: "Joined",
          lastLogin: "Last sign-in",
          view: "View profile",
        };

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_270px] xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-950">{user.email}</h3>
            {isSelf && <Badge variant="amber">{text.currentAdmin}</Badge>}
            <Badge variant={user.emailConfirmedAt ? "emerald" : "neutral"}>
            {user.emailConfirmedAt ? text.confirmed : text.pending}
            </Badge>
            {user.planStatus === "suspended" && <Badge variant="danger">{text.suspended}</Badge>}
          </div>

          <div className="mt-2 grid gap-1.5 text-xs text-slate-500 sm:grid-cols-2">
            <p className="rounded-md bg-slate-50 px-2.5 py-1.5">
              {text.joined}: {formatDate(user.createdAt, locale)}
            </p>
            <p className="rounded-md bg-slate-50 px-2.5 py-1.5">
              {text.lastLogin}: {formatDate(user.lastSignInAt, locale)}
            </p>
            <p className="rounded-md bg-slate-50 px-2.5 py-1.5">Plan: {user.planLabel}</p>
            <p className="rounded-md bg-slate-50 px-2.5 py-1.5">{locale === "ko" ? "월 한도" : "Monthly limit"}: {user.monthlyCreditLimit}</p>
          </div>
        </div>

        <div className="space-y-2">
          <LinkButton href={`/admin/users/${user.id}`} variant="secondary" className="!min-h-8 !rounded-md !px-3 !py-1.5 text-xs">
            {text.view}
          </LinkButton>
          <AdminUserActions
            userId={user.id}
            userEmail={user.email}
            currentPlan={user.plan}
            planStatus={user.planStatus}
            isSelf={isSelf}
            disabled={!hasServiceKey}
            locale={locale}
          />
        </div>
      </div>
    </article>
  );
}

function ApiUsageOverview({
  summary,
  locale,
}: {
  summary: AdminApiUsageSummary;
  locale: SiteLocale;
}) {
  const isKorean = locale === "ko";
  const estimatedKrw = Math.round(summary.estimatedCostUsd * 1_400);
  const number = new Intl.NumberFormat(isKorean ? "ko-KR" : "en-US");

  return (
    <Surface className="mt-6 overflow-hidden p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {isKorean ? "이번 달 API 원가" : "API cost this month"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {isKorean
              ? "실제 사용량 기준 추정치 · 환율 1달러 1,400원"
              : "Estimate from measured usage · USD 1 = KRW 1,400"}
          </p>
        </div>
        <strong className="text-2xl text-slate-950">
          ${summary.estimatedCostUsd.toFixed(4)}
          <span className="ml-2 text-sm font-medium text-slate-500">
            {isKorean ? `약 ${number.format(estimatedKrw)}원` : `about KRW ${number.format(estimatedKrw)}`}
          </span>
        </strong>
      </div>

      {summary.available ? (
        <>
          <dl className="grid grid-cols-2 divide-x divide-y divide-slate-200 sm:grid-cols-4 sm:divide-y-0">
            {[
              [isKorean ? "API 호출" : "API calls", number.format(summary.calls)],
              [isKorean ? "사용자" : "Users", number.format(summary.activeUsers)],
              [isKorean ? "생성 이미지" : "Generated images", number.format(summary.imageCount)],
              [isKorean ? "음성 분석" : "Audio processed", `${Math.round(summary.audioSeconds / 60)}${isKorean ? "분" : " min"}`],
            ].map(([label, value]) => (
              <div key={label} className="px-5 py-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-950">{value}</dd>
              </div>
            ))}
          </dl>
          {summary.models.length > 0 ? (
            <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 px-5 py-3 text-xs text-slate-600">
              {summary.models.map((model) => (
                <span key={model.model}>
                  <strong className="font-semibold text-slate-800">{model.model}</strong>
                  {` · ${model.calls} · $${model.estimatedCostUsd.toFixed(4)}`}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="px-5 py-4 text-sm text-amber-700">
          {isKorean
            ? "원가 로그 설정이 필요합니다. Supabase SQL Editor에서 supabase/api_usage_events.sql을 실행해주세요."
            : "Cost logging is not configured. Run supabase/api_usage_events.sql in Supabase SQL Editor."}
        </p>
      )}
    </Surface>
  );
}

function OperationFailuresOverview({
  failures,
  isAvailable,
  locale,
}: {
  failures: AdminOperationFailure[];
  isAvailable: boolean;
  locale: SiteLocale;
}) {
  const isKorean = locale === "ko";

  return (
    <Surface className="mt-6 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {isKorean ? "최근 작업 실패" : "Recent operation failures"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {isKorean ? "제작과 YouTube 게시 실패를 최근순으로 표시합니다." : "Latest production and YouTube publishing failures."}
          </p>
        </div>
        {isAvailable ? (
          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">{failures.length}</span>
        ) : null}
      </div>
      {!isAvailable ? (
        <p className="px-5 py-4 text-sm text-amber-700">
          {isKorean
            ? "Supabase SQL Editor에서 supabase/operation_failures.sql을 실행해주세요."
            : "Run supabase/operation_failures.sql in Supabase SQL Editor."}
        </p>
      ) : failures.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">
          {isKorean ? "최근 실패한 작업이 없습니다." : "No recent failed operations."}
        </p>
      ) : (
        <AdminLogList
          kind="operation_failures"
          locale={locale}
          items={failures.map((failure): AdminLogItem => ({
            id: failure.id,
            title: failure.stage,
            detail: failure.message,
            timestamp: formatDate(failure.createdAt, locale),
            href: `/admin/users/${failure.userId}`,
            hrefLabel: isKorean ? "회원" : "Member",
            tone: "danger",
          }))}
        />
      )}
    </Surface>
  );
}

function formatAuditEvent(event: AdminAuditEvent, locale: SiteLocale) {
  const isKorean = locale === "ko";
  const number = new Intl.NumberFormat(isKorean ? "ko-KR" : "en-US");

  switch (event.action) {
    case "plan_changed":
      return isKorean
        ? `플랜 변경: ${String(event.metadata.plan ?? "-")}`
        : `Plan changed: ${String(event.metadata.plan ?? "-")}`;
    case "credit_limit_changed":
      return isKorean
        ? `월 한도 변경: ${number.format(Number(event.metadata.monthlyCreditLimit ?? 0))}`
        : `Monthly limit changed: ${number.format(Number(event.metadata.monthlyCreditLimit ?? 0))}`;
    case "remaining_credits_changed":
      return isKorean
        ? `남은 크레딧 변경: ${number.format(Number(event.metadata.remainingCredits ?? 0))}`
        : `Remaining credits changed: ${number.format(Number(event.metadata.remainingCredits ?? 0))}`;
    case "credits_reset":
      return isKorean
        ? `크레딧 초기화: ${number.format(Number(event.metadata.deletedCount ?? 0))}건 삭제`
        : `Credits reset: ${number.format(Number(event.metadata.deletedCount ?? 0))} entries removed`;
    case "account_suspended":
      return isKorean ? "계정 정지" : "Account suspended";
    case "account_resumed":
      return isKorean ? "정지 해제" : "Account resumed";
    case "account_deleted":
      return isKorean ? "계정 삭제" : "Account deleted";
  }
}

function AdminAuditOverview({
  events,
  isAvailable,
  locale,
}: {
  events: AdminAuditEvent[];
  isAvailable: boolean;
  locale: SiteLocale;
}) {
  const isKorean = locale === "ko";

  return (
    <Surface className="mt-6 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {isKorean ? "관리자 변경 이력" : "Admin change history"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {isKorean ? "플랜, 크레딧, 계정 상태 변경을 최근순으로 표시합니다." : "Latest plan, credit, and account state changes."}
          </p>
        </div>
      </div>
      {!isAvailable ? (
        <p className="px-5 py-4 text-sm text-amber-700">
          {isKorean
            ? "Supabase SQL Editor에서 supabase/admin_audit_events.sql을 실행해주세요."
            : "Run supabase/admin_audit_events.sql in Supabase SQL Editor."}
        </p>
      ) : events.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">
          {isKorean ? "아직 기록된 관리자 변경이 없습니다." : "No admin changes have been recorded yet."}
        </p>
      ) : (
        <AdminLogList
          kind="admin_audit_events"
          locale={locale}
          items={events.map((event): AdminLogItem => ({
            id: event.id,
            title: formatAuditEvent(event, locale) ?? "-",
            detail: `${isKorean ? "대상" : "Target"}: ${event.targetUserId}${event.actorUserId ? ` · ${isKorean ? "관리자" : "Admin"}: ${event.actorUserId}` : ""}`,
            timestamp: formatDate(event.createdAt, locale),
          }))}
        />
      )}
    </Surface>
  );
}

export default async function AdminPage({ searchParams }: Props) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) redirect("/dashboard");

  const [params, locale] = await Promise.all([searchParams, getSiteLocale()]);
  const isVerified = await isCurrentAdminVerified();
  const emailQuery = params?.email?.trim() ?? "";
  const hasServiceKey = hasSupabaseServiceRoleKey();
  const text =
    locale === "ko"
      ? {
          title: "회원 관리",
          members: "회원",
          setupTitle: "관리자 기능 설정이 필요합니다.",
          setup: "계정 삭제와 목록 조회에는 서버 전용 service role key가 필요합니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY와 ADMIN_EMAILS를 설정해주세요.",
          load: "관리자 정보를 불러오지 못했습니다.",
          limited: "이메일 검색으로 범위를 좁혀 확인해주세요.",
          emptySearch: "검색된 회원이 없습니다.",
          empty: "표시할 회원이 없습니다.",
        }
      : {
          title: "Member management",
          members: "Members",
          setupTitle: "Admin setup is required.",
          setup: "Account deletion and member lookup require the server-only service role key. Set SUPABASE_SERVICE_ROLE_KEY and ADMIN_EMAILS in .env.local.",
          load: "Could not load admin information.",
          limited: "Use email search to narrow the result set.",
          emptySearch: "No members matched the search.",
          empty: "No members to display.",
      };

  if (!isVerified) {
    return (
      <PageShell
        contentClassName="mx-auto w-full"
        contentStyle={{ maxWidth: "var(--app-header-max-width)" }}
      >
        <AppHeader
          locale={locale}
          mode="admin"
        />
        <AdminPasswordGate locale={locale} />
      </PageShell>
    );
  }

  let users: AdminUserListItem[] = [];
  let apiUsageSummary: AdminApiUsageSummary | null = null;
  let operationFailures: AdminOperationFailure[] = [];
  let operationFailuresAvailable = false;
  let adminAuditEvents: AdminAuditEvent[] = [];
  let adminAuditEventsAvailable = false;
  let isLimited = false;
  let errorMessage = "";
  let planCreditSettings: Awaited<ReturnType<typeof getPlanCreditSettings>> | null = null;
  if (hasServiceKey) {
    const [userResult, usageResult, failuresResult, auditResult, planSettingsResult] = await Promise.all([
      listAdminUsers({ emailQuery })
        .then((value) => ({ value, error: "" }))
        .catch((error: unknown) => ({
          value: null,
          error: error instanceof Error ? error.message : text.load,
        })),
      getAdminApiUsageSummary(),
      listRecentOperationFailures(),
      listRecentAdminAuditEvents(),
      getPlanCreditSettings(),
    ]);
    planCreditSettings = planSettingsResult;
    apiUsageSummary = usageResult;
    operationFailures = failuresResult.failures;
    operationFailuresAvailable = !failuresResult.error;
    adminAuditEvents = auditResult.events;
    adminAuditEventsAvailable = !auditResult.error;
    if (userResult.value) {
      const result = userResult.value;
      users = result.users;
      isLimited = result.isLimited;
    } else {
      errorMessage = userResult.error;
    }
  }

  return (
    <PageShell
      contentClassName="mx-auto w-full"
      contentStyle={{ maxWidth: "var(--app-header-max-width)" }}
    >
      <AppHeader
        locale={locale}
        mode="admin"
      />

      {!hasServiceKey && (
        <Surface className="mt-6 border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-semibold text-amber-800">{text.setupTitle}</h2>
          <p className="mt-3 text-sm leading-6 text-amber-700">{text.setup}</p>
        </Surface>
      )}

      {errorMessage && (
        <Surface className="mt-6 border-red-200 bg-red-50 p-6">
          <p className="text-sm leading-6 text-red-700">{errorMessage}</p>
        </Surface>
      )}

      {apiUsageSummary ? (
        <ApiUsageOverview summary={apiUsageSummary} locale={locale} />
      ) : null}

      {planCreditSettings?.available ? (
        <AdminPlanCreditSettings settings={planCreditSettings.settings} locale={locale} />
      ) : hasServiceKey ? (
        <Surface className="mt-6 border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          {locale === "ko"
            ? "플랜별 크레딧 설정을 사용하려면 Supabase SQL Editor에서 supabase/plan_credit_settings.sql을 실행해주세요."
            : "Run supabase/plan_credit_settings.sql to configure plan credits."}
        </Surface>
      ) : null}

      {hasServiceKey ? (
        <OperationFailuresOverview
          failures={operationFailures}
          isAvailable={operationFailuresAvailable}
          locale={locale}
        />
      ) : null}

      {hasServiceKey ? (
        <AdminAuditOverview
          events={adminAuditEvents}
          isAvailable={adminAuditEventsAvailable}
          locale={locale}
        />
      ) : null}

      {hasServiceKey ? (
        <AdminNotificationComposer
          users={users.map((user) => ({ id: user.id, email: user.email }))}
          locale={locale}
        />
      ) : null}

      <section className="mt-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">{text.members}</h2>
          {isLimited && <p className="mt-2 text-sm leading-6 text-slate-500">{text.limited}</p>}
          <AdminUserSearchForm initialEmailQuery={emailQuery} locale={locale} />
        </div>

        {users.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
            {emailQuery ? text.emptySearch : text.empty}
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                currentAdminId={adminUser.id}
                hasServiceKey={hasServiceKey}
                locale={locale}
              />
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}
