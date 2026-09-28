import { redirect } from "next/navigation";
import PageShell from "@/app/components/PageShell";
import Surface from "@/app/components/ui/Surface";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import SuspendedAccountActions from "./SuspendedAccountActions";

export default async function SuspendedPage() {
  const user = await getAuthenticatedApiUser();
  if (!user) redirect("/login");

  return (
    <PageShell className="grid min-h-screen place-items-center px-4 py-8">
      <Surface className="w-full max-w-md p-7 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-600">Shate</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">계정이 정지되었습니다</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          현재 제작, 업로드, 다운로드 기능을 사용할 수 없습니다. 관리자에게 문의해 정지 해제를 요청해주세요.
        </p>
        <div className="mt-6 flex justify-center"><SuspendedAccountActions /></div>
      </Surface>
    </PageShell>
  );
}
