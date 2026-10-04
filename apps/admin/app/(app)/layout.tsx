"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { RouteSkeleton } from "@/components/route-skeleton";
import { useSession } from "@/lib/session";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { teacher, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !teacher) router.replace("/login");
  }, [loading, teacher, router]);

  // While the session resolves we still paint the shell and the page chrome —
  // a lone spinner in the middle of a blank page is the tell of an unpolished app.
  if (loading) return <AppShell><RouteSkeleton /></AppShell>;
  if (!teacher) return null;

  return <AppShell>{children}</AppShell>;
}
