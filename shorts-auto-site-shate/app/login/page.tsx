import { getSiteLocale } from "@/lib/i18n/server";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const locale = await getSiteLocale();

  return <LoginForm locale={locale} />;
}
