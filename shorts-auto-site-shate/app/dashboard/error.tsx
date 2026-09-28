"use client";

import PageError from "@/app/components/PageError";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      error={error}
      onRetry={reset}
    />
  );
}
