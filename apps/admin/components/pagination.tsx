"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * The one pager for every list in the app.
 *
 * Counts are shown as figures ("Showing 21–40 of 148") because a page number
 * on its own tells you nothing about how much is left, and every list in this
 * app is served in pages from the Worker — never fetched whole and sliced here.
 */
export function Pagination({
  total,
  limit,
  offset,
  onChange,
  className,
  noun = "rows",
}: {
  total: number;
  limit: number;
  offset: number;
  onChange: (next: { limit: number; offset: number }) => void;
  className?: string;
  noun?: string;
}) {
  if (total <= limit) return null;

  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);

  const go = (next: number) => {
    const clamped = Math.min(Math.max(next, 1), pages);
    const nextOffset = (clamped - 1) * limit;
    if (nextOffset !== offset) onChange({ limit, offset: nextOffset });
  };

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4",
        className,
      )}
    >
      <p className="text-muted-foreground text-sm tabular-nums">
        Showing <span className="text-foreground font-medium">{from.toLocaleString()}–{to.toLocaleString()}</span>{" "}
        of {total.toLocaleString()} {noun}
      </p>

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
        >
          <ChevronLeft className="size-3.5" /> Prev
        </Button>

        {pageNumbers(page, pages).map((entry, index) =>
          entry === "…" ? (
            <span key={`gap-${index}`} className="text-muted-foreground px-1 text-sm">
              …
            </span>
          ) : (
            <Button
              key={entry}
              size="sm"
              variant={entry === page ? "default" : "ghost"}
              className="tabular-nums"
              onClick={() => go(entry)}
            >
              {entry}
            </Button>
          ),
        )}

        <Button
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => go(page + 1)}
        >
          Next <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </nav>
  );
}

/** 1 … 4 5 [6] 7 8 … 20 — never more than seven slots. */
function pageNumbers(current: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

  const slots: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(pages - 1, current + 1);
  if (start > 2) slots.push("…");
  for (let n = start; n <= end; n++) slots.push(n);
  if (end < pages - 1) slots.push("…");
  slots.push(pages);
  return slots;
}
