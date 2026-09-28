"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Button from "@/app/components/ui/Button";
import Input from "@/app/components/ui/Input";
import type { SiteLocale } from "@/lib/i18n/config";

type Props = {
  initialEmailQuery: string;
  locale: SiteLocale;
};

export default function AdminUserSearchForm({
  initialEmailQuery,
  locale,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [emailQuery, setEmailQuery] = useState(initialEmailQuery);
  const text =
    locale === "ko"
      ? { placeholder: "이메일로 회원 검색", search: "검색", all: "전체 보기" }
      : { placeholder: "Search members by email", search: "Search", all: "View all" };

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams);
    const trimmed = emailQuery.trim();

    if (trimmed) params.set("email", trimmed);
    else params.delete("email");

    router.push(`/admin${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function clearSearch() {
    setEmailQuery("");
    router.push("/admin");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-1.5 sm:flex-row">
      <Input
        type="search"
        value={emailQuery}
        onChange={(event) => setEmailQuery(event.target.value)}
        placeholder={text.placeholder}
        className="sm:max-w-md"
      />
      <Button type="submit" className="min-h-9 px-4 py-2 text-xs">
        {text.search}
      </Button>
      {initialEmailQuery && (
        <Button type="button" variant="secondary" onClick={clearSearch} className="min-h-9 px-4 py-2 text-xs">
          {text.all}
        </Button>
      )}
    </form>
  );
}
