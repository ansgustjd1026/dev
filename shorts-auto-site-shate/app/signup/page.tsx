import { getSiteLocale } from "@/lib/i18n/server";
import SignupForm from "./SignupForm";

export default async function SignupPage() {
  const locale = await getSiteLocale();

  return <SignupForm locale={locale} />;
}
