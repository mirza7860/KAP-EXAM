"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BatchFormDialog } from "@/components/batch-form-dialog";
import { PageBody, PageHeader } from "@/components/page-header";
import { Copy, Loader2, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError, batchApi, type BatchSummary } from "@/lib/api";

export default function BatchesPage() {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copyFrom, setCopyFrom] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBatches(await batchApi.list());
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not load batches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setCopyFrom(null);
    setDialogOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Batches"
        description="Semester cohorts and their student rosters."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" /> New batch
          </Button>
        }
      />
      <PageBody>
        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading batches…
          </div>
        ) : batches.length === 0 ? (
          <div className="border-border flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <Users className="text-muted-foreground size-6" />
            <p className="text-muted-foreground text-sm">
              No batches yet. Create one for the current term.
            </p>
            <Button onClick={openNew}>
              <Plus className="size-4" /> New batch
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {batches.map((batch) => (
              <Card key={batch.id} className="transition-colors hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="truncate">{batch.name}</CardTitle>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {batch.studentCount} student{batch.studentCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {batch.description || "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/batches/${batch.id}`}>Open</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCopyFrom(batch.id);
                      setDialogOpen(true);
                    }}
                  >
                    <Copy className="size-4" /> Copy to new term
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <BatchFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        batches={batches}
        copyFromId={copyFrom}
        onCreated={(batch) => setBatches((current) => [batch, ...current])}
      />
    </>
  );
}
