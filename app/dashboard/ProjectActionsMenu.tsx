"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function ProjectActionsMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={label}
        title={label}
        aria-expanded={isOpen}
        className="grid size-10 place-items-center rounded-lg border border-slate-300 bg-white text-xl font-bold leading-none text-slate-700 shadow-sm transition hover:border-slate-500 hover:bg-slate-50"
      >
        <span aria-hidden="true" className="-translate-y-0.5">⋯</span>
      </button>

      <div
        className={`absolute right-0 top-full z-30 mt-2 w-44 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xl ${
          isOpen ? "grid" : "hidden"
        }`}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button, a")) {
            setIsOpen(false);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
