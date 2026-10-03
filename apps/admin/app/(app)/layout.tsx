"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { useSession } from "@/lib/session";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { teacher, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !teacher) router.replace("/login");
  }, [loading, teacher, router]);

  if (loading) {
    return (
      <div className="grid flex-1 place-items-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }
  if (!teacher) return null;

  return <AppShell>{children}</AppShell>;
}
