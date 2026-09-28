"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import Button from "@/app/components/ui/Button";

type SelectionContextValue = {
  selectedIds: Set<string>;
  isDeleting: boolean;
  isSelectionMode: boolean;
  toggleProject: (projectId: string) => void;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

type BulkSelectionProps = {
  projectIds: string[];
  locale: "ko" | "en";
  actions?: ReactNode;
  children: ReactNode;
};

type DeleteResult = {
  projectId: string;
  error: string;
};

async function deleteProject(projectId: string): Promise<DeleteResult> {
  try {
    const response = await fetch("/api/projects/cleanup-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        scope: "all",
        deleteProject: true,
      }),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    return {
      projectId,
      error: response.ok
        ? ""
        : data?.error || `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      projectId,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export default function ProjectBulkSelection({
  projectIds,
  locale,
  actions,
  children,
}: BulkSelectionProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [message, setMessage] = useState("");
  const allSelected =
    projectIds.length > 0 && projectIds.every((id) => selectedIds.has(id));

  const labels = locale === "ko"
    ? {
        selectAll: "전체 선택",
        selected: "개 선택",
        select: "관리",
        done: "완료",
        delete: "선택 삭제",
        deleting: "삭제 중",
        confirm: (count: number) =>
          `선택한 프로젝트 ${count}개를 삭제할까요? 관련 음성과 완성 영상도 함께 삭제됩니다.`,
        partialFailure: (count: number, reason: string) =>
          `${count}개를 삭제하지 못했습니다. ${reason}`,
      }
    : {
        selectAll: "Select all",
        selected: "selected",
        select: "Manage",
        done: "Done",
        delete: "Delete selected",
        deleting: "Deleting",
        confirm: (count: number) =>
          `Delete ${count} selected projects? Related audio and final videos will also be deleted.`,
        partialFailure: (count: number, reason: string) =>
          `${count} projects could not be deleted. ${reason}`,
      };

  const contextValue = useMemo<SelectionContextValue>(
    () => ({
      selectedIds,
      isDeleting,
      isSelectionMode,
      toggleProject(projectId) {
        setSelectedIds((current) => {
          const next = new Set(current);
          if (next.has(projectId)) next.delete(projectId);
          else next.add(projectId);
          return next;
        });
        setMessage("");
      },
    }),
    [isDeleting, isSelectionMode, selectedIds]
  );

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(projectIds));
    setMessage("");
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0 || !window.confirm(labels.confirm(ids.length))) return;

    setIsDeleting(true);
    setMessage("");
    const results: DeleteResult[] = [];

    for (let index = 0; index < ids.length; index += 3) {
      const batch = ids.slice(index, index + 3);
      results.push(...(await Promise.all(batch.map(deleteProject))));
    }

    const failed = results.filter((result) => result.error);
    setSelectedIds(new Set(failed.map((result) => result.projectId)));
    setIsDeleting(false);
    if (failed.length === 0) setIsSelectionMode(false);

    if (failed.length > 0) {
      setMessage(labels.partialFailure(failed.length, failed[0].error));
    }

    router.refresh();
  }

  return (
    <SelectionContext.Provider value={contextValue}>
      {isSelectionMode ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                disabled={isDeleting}
                className="size-4 accent-[#172033]"
              />
              {labels.selectAll}
            </label>
            <span className="text-sm text-slate-500">
              <strong className="text-slate-950">{selectedIds.size}</strong>{" "}
              {labels.selected}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSelectedIds(new Set());
                setIsSelectionMode(false);
                setMessage("");
              }}
              disabled={isDeleting}
              className="min-h-9 px-3 py-2"
            >
              {labels.done}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleBulkDelete}
              disabled={selectedIds.size === 0 || isDeleting}
              className="min-h-9 px-3 py-2"
            >
              {isDeleting ? labels.deleting : labels.delete}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex w-full flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {actions}
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsSelectionMode(true)}
            className="ml-auto px-3.5"
          >
            {labels.select}
          </Button>
        </div>
      )}

      {message ? (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      ) : null}

      {children}
    </SelectionContext.Provider>
  );
}

export function ProjectSelectCheckbox({
  projectId,
  projectTitle,
  locale,
}: {
  projectId: string;
  projectTitle: string;
  locale: "ko" | "en";
}) {
  const context = useContext(SelectionContext);
  if (!context?.isSelectionMode) return null;

  return (
    <label
      className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white transition hover:border-slate-400 hover:bg-slate-50"
      title={locale === "ko" ? `${projectTitle} 선택` : `Select ${projectTitle}`}
    >
      <input
        type="checkbox"
        checked={context.selectedIds.has(projectId)}
        onChange={() => context.toggleProject(projectId)}
        disabled={context.isDeleting}
        aria-label={locale === "ko" ? `${projectTitle} 선택` : `Select ${projectTitle}`}
        className="size-4 accent-[#172033]"
      />
    </label>
  );
}
