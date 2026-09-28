"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Button from "@/app/components/ui/Button";

type Props = {
  label: string;
  className?: string;
};

export default function LogoutButton({ label, className }: Props) {
  const supabase = createClient();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button onClick={handleLogout} className={className}>
      {label}
    </Button>
  );
}
