import { redirect } from "next/navigation";
import PageShell from "@/app/components/PageShell";
import Surface from "@/app/components/ui/Surface";
import { getSiteLocale } from "@/lib/i18n/server";
import PaymentSubscriptionConfirm from "./PaymentSubscriptionConfirm";

type Props = {
  searchParams: Promise<{ authKey?: string; customerKey?: string; plan?: string }>;
};

export default async function PaymentSubscriptionSuccessPage({ searchParams }: Props) {
  const [params, locale] = await Promise.all([searchParams, getSiteLocale()]);
  if (!params.authKey || !params.customerKey || (params.plan !== "starter" && params.plan !== "pro")) {
    redirect("/pricing/fail?code=INVALID_BILLING_RESPONSE");
  }
  return (
    <PageShell>
      <Surface className="mx-auto max-w-lg p-8">
        <PaymentSubscriptionConfirm authKey={params.authKey} customerKey={params.customerKey} plan={params.plan} isKorean={locale === "ko"} />
      </Surface>
    </PageShell>
  );
}
