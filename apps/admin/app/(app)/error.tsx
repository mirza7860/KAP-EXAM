"use client";

import { Button } from "@/components/ui/button";
import { PageBody, PageHeader } from "@/components/page-header";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

/**
 * Route-level error boundary. Next 16 hands us `retry` (not `reset`) — it
 * re-fetches the segment rather than just clearing the state.
 */
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHeader title="Something broke" description="This screen hit an unexpected error." />
      <PageBody>
        <div className="border-border/80 flex flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-20 text-center">
          <div className="bg-destructive/10 text-destructive grid size-11 place-items-center rounded-full">
            <AlertTriangle className="size-5" />
          </div>
          <div className="max-w-sm space-y-1">
            <p className="display text-base font-medium">That didn&apos;t work</p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {error.message || "An unexpected error occurred."}
            </p>
          </div>
          <Button variant="outline" onClick={() => retry()}>
            Try again
          </Button>
        </div>
      </PageBody>
    </>
  );
}
