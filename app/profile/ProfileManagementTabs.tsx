"use client";

import { useState, type ReactNode } from "react";

type TabId =
  | "credits"
  | "subscription"
  | "youtube"
  | "posts"
  | "backgrounds"
  | "settings";

type TabItem = {
  id: TabId;
  label: string;
  content: ReactNode;
};

type Props = {
  tabs: TabItem[];
  initialTab?: TabId;
};

export default function ProfileManagementTabs({ tabs, initialTab }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>(
    tabs.some((tab) => tab.id === initialTab) ? initialTab! : tabs[0]?.id ?? "youtube"
  );
  const activeItem = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  if (!activeItem) return null;

  return (
    <section className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab.id
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-700 hover:bg-white/70 hover:text-slate-950"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>{activeItem.content}</div>
    </section>
  );
}
