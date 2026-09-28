"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { ResultPreviewPanelProps } from "./ResultPreviewPanel";

const ResultPreviewPanel = dynamic(() => import("./ResultPreviewPanel"), {
  loading: () => <PreviewPanelLoading />,
});

function PreviewPanelLoading() {
  return (
    <div
      className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      aria-hidden="true"
    >
      <div className="h-6 w-36 rounded bg-slate-200" />
      <div className="mt-5 h-36 rounded-xl bg-slate-100" />
    </div>
  );
}

export default function DeferredResultPreviewPanel(
  props: ResultPreviewPanelProps
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (typeof IntersectionObserver === "undefined") {
      const timeoutId = globalThis.setTimeout(() => setShouldLoad(true), 0);
      return () => globalThis.clearTimeout(timeoutId);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "0px" }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef}>
      {shouldLoad ? <ResultPreviewPanel {...props} /> : <PreviewPanelLoading />}
    </div>
  );
}
