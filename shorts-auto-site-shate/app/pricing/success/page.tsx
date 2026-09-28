import { redirect } from "next/navigation";
import PageShell from "@/app/components/PageShell";
import Surface from "@/app/components/ui/Surface";
import { getSiteLocale } from "@/lib/i18n/server";
import PaymentConfirm from "./PaymentConfirm";

type Props = { searchParams: Promise<{ paymentKey?: string; orderId?: string; amount?: string }> };

export default async function PaymentSuccessPage({ searchParams }: Props) {
  const [params, locale] = await Promise.all([searchParams, getSiteLocale()]);
  const amount = Number(params.amount);
  if (!params.paymentKey || !params.orderId || !Number.isInteger(amount) || amount <= 0) redirect("/pricing/fail?code=INVALID_PAYMENT_RESPONSE");
  return <PageShell><Surface className="mx-auto max-w-lg p-8"><PaymentConfirm paymentKey={params.paymentKey} orderId={params.orderId} amount={amount} isKorean={locale === "ko"} /></Surface></PageShell>;
}

