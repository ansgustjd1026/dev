"use client";

import LinkButton from "@/app/components/ui/LinkButton";
import Surface from "@/app/components/ui/Surface";
import BrandWordmark from "@/app/components/BrandWordmark";
import NotificationMenu from "@/app/components/NotificationMenu";
import CreditFloatingWidget from "@/app/components/CreditFloatingWidget";
import Link from "next/link";
import type { SiteLocale } from "@/lib/i18n/config";
import type { ReactNode } from "react";

type Props = {
  locale: SiteLocale;
  mode?: "user" | "admin";
  action?: {
    href: string;
    label: string;
  };
  center?: ReactNode;
  extraActions?: ReactNode;
  profileWidget?: ReactNode;
  attachedFooter?: boolean;
  showProfile?: boolean;
  showNotifications?: boolean;
};

export default function AppHeader({
  locale,
  mode = "user",
  action,
  center,
  extraActions,
  profileWidget,
  attachedFooter = false,
  showProfile = true,
  showNotifications = true,
}: Props) {
  const isAdminMode = mode === "admin";

  return (
    <Surface
      as="header"
      style={{
        width: "calc(100vw - var(--app-header-gutter))",
        maxWidth: "var(--app-header-max-width)",
        height: "var(--app-header-height)",
      }}
      className={`relative z-[80] isolate left-1/2 mb-4 flex -translate-x-1/2 flex-wrap items-center justify-between gap-3 px-4 py-3 md:mb-5 md:flex-nowrap md:gap-4 md:px-5 ${
        attachedFooter ? "!mb-0 !rounded-b-none !border-b-0" : ""
      }`}
    >
      <Link
        href="/dashboard"
        prefetch={false}
        aria-label={locale === "ko" ? "대시보드로 이동" : "Go to dashboard"}
        className="group inline-flex shrink-0 items-center rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm outline-none transition duration-150 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md focus-visible:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-500/25"
      >
        <BrandWordmark
          size="header"
          className="origin-center transition-transform duration-150 group-hover:scale-[1.03]"
        />
      </Link>

      {center ? (
        <div className="order-3 min-w-0 basis-full md:order-none md:mx-5 md:flex-1 md:basis-auto">
          {center}
        </div>
      ) : null}

      <nav className="ml-auto flex min-w-0 flex-nowrap items-center gap-2" aria-label="Main navigation">
        {extraActions}
        {action ? (
          <LinkButton href={action.href} className="min-w-0 px-4 py-2.5">
            {action.label}
          </LinkButton>
        ) : null}
        {showProfile && !isAdminMode ? profileWidget ?? <CreditFloatingWidget locale={locale} /> : null}
        {showNotifications && !isAdminMode ? <NotificationMenu locale={locale} /> : null}
      </nav>
    </Surface>
  );
}
