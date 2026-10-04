import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one empty state used across the app. An icon in a soft well, a short
 * display line, one sentence of guidance, one action. Repeating this shape
 * everywhere is what makes the app feel considered rather than assembled.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/80 px-6 py-20 text-center",
        className,
      )}
    >
      {icon && (
        <div className="bg-muted text-muted-foreground grid size-11 place-items-center rounded-full">
          {icon}
        </div>
      )}
      <div className="max-w-sm space-y-1">
        <p className="display text-base font-medium">{title}</p>
        {description && <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>}
      </div>
      {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
