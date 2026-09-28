"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/app/components/ui/Button";

type Props = {
  projectId: string;
  labels: {
    confirm: string;
    fileDeleteFailed: string;
    deleteFailed: string;
    deleting: string;
    delete: string;
  };
};

export default function DeleteProjectButton({ projectId, labels }: Props) {
  const router = useRouter();

  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleDelete() {
    const ok = window.confirm(labels.confirm);

    if (!ok) return;

    setIsDeleting(true);
    setMessage("");

    try {
      const cleanupResponse = await fetch("/api/projects/cleanup-files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          scope: "all",
          deleteProject: true,
        }),
      });

      const cleanupData = await cleanupResponse.json();

      if (!cleanupResponse.ok) {
        setMessage(cleanupData.error ?? labels.fileDeleteFailed);
        return;
      }

      router.refresh();
    } catch {
      setMessage(labels.deleteFailed);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-start gap-2">
      <Button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        variant="danger"
        className="w-full px-4"
      >
        {isDeleting ? labels.deleting : labels.delete}
      </Button>

      {message ? (
        <p className="max-w-64 text-xs leading-5 text-red-200">{message}</p>
      ) : null}
    </div>
  );
}
