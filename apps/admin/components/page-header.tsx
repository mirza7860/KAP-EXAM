import { SidebarTrigger } from "@/components/ui/sidebar";
import type { ReactNode } from "react";

/**
 * Page chrome. The title is set in the display face so every screen starts
 * with the same editorial voice; actions sit on the baseline.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 border-b border-border/70 backdrop-blur">
      <div className="flex items-end justify-between gap-6 px-8 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="-ml-1.5" />
          <div className="min-w-0">
            <h1 className="display truncate text-[1.375rem] font-semibold">{title}</h1>
            {description && (
              <p className="text-muted-foreground mt-1 truncate text-sm">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function PageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={"min-h-0 flex-1 overflow-y-auto px-8 py-7 " + (className ?? "")}>{children}</div>
  );
}

/** A quiet section heading inside a page. */
export function SectionHeading({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}
