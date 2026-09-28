import Link from "next/link";
import PageShell from "@/app/components/PageShell";
import Surface from "@/app/components/ui/Surface";
import { getSiteLocale } from "@/lib/i18n/server";

type Props = { searchParams: Promise<{ code?: string; message?: string }> };

export default async function PaymentFailPage({ searchParams }: Props) {
  const [params, locale] = await Promise.all([searchParams, getSiteLocale()]);
  const isKorean = locale === "ko";
  return <PageShell><Surface className="mx-auto max-w-lg p-8 text-center"><h1 className="text-2xl font-bold text-slate-950">{isKorean ? "결제가 완료되지 않았습니다" : "Payment was not completed"}</h1><p className="mt-3 text-sm text-red-700">{params.message ?? params.code ?? (isKorean ? "결제를 다시 시도해주세요." : "Please try again.")}</p><Link href="/pricing" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white">{isKorean ? "요금제로 돌아가기" : "Back to plans"}</Link></Surface></PageShell>;
}

