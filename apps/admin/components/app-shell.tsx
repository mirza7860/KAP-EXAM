"use client";

import { cn, Logo } from "@kap-exam/ui";
import {
  BarChart3,
  ClipboardList,
  FolderTree,
  LayoutDashboard,
  Library,
  LogOut,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "@/lib/session";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/questions", label: "Question bank", icon: Library },
  { href: "/modules", label: "Modules", icon: FolderTree },
  { href: "/batches", label: "Batches", icon: Users },
  { href: "/exams", label: "Exams", icon: ClipboardList },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { teacher, signOut } = useSession();

  return (
    <div className="flex flex-1">
      <aside className="bg-card/40 flex w-60 shrink-0 flex-col border-r">
        <div className="flex h-16 items-center px-5">
          <Logo height={26} />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium">{teacher?.name}</p>
            <p className="text-muted-foreground truncate text-xs">{teacher?.email}</p>
          </div>
          <button
            onClick={() => {
              signOut();
              router.replace("/login");
            }}
            className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
