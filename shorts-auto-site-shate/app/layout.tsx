import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getUserPreferences } from "@/lib/preferences/server";
import GlobalAutoCreateHost from "@/app/components/GlobalAutoCreateHost";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shate",
  description:
    "Create short-form videos with AI scripts, voice, captions, and publishing tools.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const preferences = await getUserPreferences();
  const locale = preferences.locale;
  const publicConfig = JSON.stringify({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  }).replace(/</g, "\\u003c");

  return (
    <html
      lang={locale}
      data-theme={preferences.theme === "dark" ? "dark" : "light"}
      data-theme-setting={preferences.theme}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__shatePublicConfig=${publicConfig};`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(()=>{const e=document.documentElement,m=matchMedia('(prefers-color-scheme: dark)');const a=()=>{if(e.dataset.themeSetting==='system')e.dataset.theme=m.matches?'dark':'light'};a();m.addEventListener?.('change',a)})()",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <GlobalAutoCreateHost
          locale={locale}
          defaultScriptLanguage={preferences.scriptLanguage}
          defaultScriptDurationSeconds={preferences.scriptDurationSeconds}
          defaultVoice={preferences.voice}
          defaultYouTubePrivacy={preferences.youtubePrivacy}
          defaultAutoVisualMode={preferences.autoVisualMode}
          defaultVideoVisualStyle={preferences.videoVisualStyle}
          defaultBackgroundPlaybackSpeed={preferences.backgroundPlaybackSpeed}
          defaultBackgroundDirection={preferences.backgroundDirection}
        />
      </body>
    </html>
  );
}
