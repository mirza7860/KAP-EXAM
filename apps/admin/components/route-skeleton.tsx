import { Skeleton } from "@/components/ui/skeleton";

/**
 * What every authenticated route paints on first render — the chrome, in the
 * right proportions, before any data exists. Reused by loading.tsx and by the
 * session gate in the (app) layout, so a cold load never becomes a bare
 * spinner floating in the middle of a blank page.
 */
export function RouteSkeleton() {
  return (
    <>
      <header className="border-border/70 sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
        <div className="flex items-end justify-between gap-6 px-8 py-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-6" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-8 py-7">
        <Skeleton className="h-3.5 w-24" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </>
  );
}
