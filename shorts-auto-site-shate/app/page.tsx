import { redirect } from "next/navigation";
import BrandWordmark from "@/app/components/BrandWordmark";
import PageShell from "@/app/components/PageShell";
import LinkButton from "@/app/components/ui/LinkButton";
import { createClient } from "@/lib/supabase/server";
import { getSiteLocale } from "@/lib/i18n/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  const locale = await getSiteLocale();
  const isKorean = locale === "ko";
  const copy = isKorean
    ? {
        titleStart: "클릭 몇 번에",
        titleStrong: "쇼츠 생성부터 게시까지",
        start: "회원가입",
        login: "로그인",
        flow: "제작 흐름",
        ready: "업로드 준비",
        stages: ["대본", "음성", "자막", "영상"],
        previewTitle: "월급은 그대로인데 왜 더 가난해질까?",
        previewCaption: "문제는 소비가 아니라 매달 새는 고정비입니다.",
      }
    : {
        titleStart: "One idea.",
        titleStrong: "A Short ready to publish.",
        start: "Sign up",
        login: "Log in",
        flow: "Production flow",
        ready: "Ready to publish",
        stages: ["Script", "Voice", "Captions", "Video"],
        previewTitle: "Why do you feel poorer on the same salary?",
        previewCaption: "The real problem may be your recurring expenses.",
      };

  return (
    <PageShell
      className="py-3 sm:py-4 lg:h-screen lg:min-h-0"
      contentClassName="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-6xl flex-col lg:h-full lg:min-h-0"
    >
      <header className="flex h-11 shrink-0 items-center justify-end sm:h-12">
        <div className="flex items-center gap-2">
          <LinkButton href="/login" variant="secondary" className="min-w-20 px-3 py-2">
            {copy.login}
          </LinkButton>
          <LinkButton href="/signup" className="min-w-22 px-3 py-2">
            {copy.start}
          </LinkButton>
        </div>
      </header>

      <section className="grid flex-1 items-center gap-8 py-8 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-14 lg:py-4">
        <div className="max-w-2xl">
          <BrandWordmark size="lg" className="mb-4" />
          <p className="mb-6 text-sm leading-6 text-slate-600">
            {isKorean ? (
              <>
                <strong className="font-bold text-slate-950">Sh</strong>orts{" "}
                <strong className="font-bold text-slate-950">A</strong>uto Si
                <strong className="font-bold text-slate-950">te</strong>
              </>
            ) : (
              <>
                <strong className="font-bold text-slate-950">Shate</strong> ={" "}
                <strong className="font-bold text-slate-950">Sh</strong>orts{" "}
                <strong className="font-bold text-slate-950">A</strong>uto Si
                <strong className="font-bold text-slate-950">te</strong>
              </>
            )}
          </p>
          <h1 className="max-w-xl text-4xl font-bold leading-[1.1] text-slate-950 sm:text-5xl lg:text-[3.5rem]">
            {copy.titleStart}
            <br />
            <strong className="font-bold text-sky-700">{copy.titleStrong}</strong>
          </h1>
          <p className="mt-5 max-w-xl text-base font-medium leading-7 text-slate-700 sm:text-lg">
            {isKorean
              ? "주제만 정하면 대본부터 영상과 YouTube 게시까지 한번에 이어집니다."
              : "Choose a topic and continue through script, video, and YouTube publishing."}
          </p>
        </div>

        <div className="mx-auto w-full max-w-[300px] lg:max-w-none">
          <div className="app-dark-preview rounded-2xl border border-slate-300 bg-slate-950 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between border-b border-slate-700 pb-2.5">
              <span className="text-xs font-semibold text-slate-300">{copy.flow}</span>
              <span className="rounded-md bg-emerald-400/15 px-2 py-1 text-[11px] font-bold text-emerald-300">
                {copy.ready}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {copy.stages.map((stage, index) => (
                <div
                  key={stage}
                  className={`rounded-lg border px-1 py-1.5 text-center text-[10px] font-bold ${
                    index === copy.stages.length - 1
                      ? "border-sky-400 bg-sky-400 text-slate-950"
                      : "border-slate-700 bg-slate-900 text-slate-300"
                  }`}
                >
                  {stage}
                </div>
              ))}
            </div>

            <div className="mt-3 h-[360px] overflow-hidden rounded-xl border border-slate-700 bg-[linear-gradient(160deg,#1e293b_0%,#0f172a_46%,#0b1120_100%)] p-4 sm:h-[400px] lg:h-[410px]">
              <div className="flex h-full flex-col justify-between">
                <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400">
                  <span>SHATE</span>
                  <span>00:18</span>
                </div>
                <div>
                  <div className="mb-3 h-1.5 w-12 rounded-full bg-sky-400" />
                  <p className="text-2xl font-bold leading-tight text-white">
                    {copy.previewTitle}
                  </p>
                  <p className="mt-3 inline-block rounded-md bg-white px-2 py-1.5 text-sm font-bold leading-5 text-slate-950">
                    {copy.previewCaption}
                  </p>
                </div>
                <span aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
