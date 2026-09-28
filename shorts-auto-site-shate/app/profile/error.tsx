"use client";

import PageError from "@/app/components/PageError";

export default function ProfileError({
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
