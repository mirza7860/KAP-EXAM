"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BatchFormDialog } from "@/components/batch-form-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageBody, PageHeader } from "@/components/page-header";
import { Copy, Loader2, MoreHorizontal, Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError, batchApi, type BatchSummary } from "@/lib/api";

export default function BatchesPage() {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BatchSummary | null>(null);

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

  async function removeBatch(batch: BatchSummary) {
    try {
      await batchApi.remove(batch.id);
      setBatches((current) => current.filter((b) => b.id !== batch.id));
      toast.success("Batch deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not delete");
    }
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
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-muted-foreground text-xs">
                        {batch.studentCount} student{batch.studentCount === 1 ? "" : "s"}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setCopyFrom(batch.id);
                              setDialogOpen(true);
                            }}
                          >
                            <Copy /> Copy to new term
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeleting(batch)}
                          >
                            <Trash2 /> Delete batch
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
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

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name ?? "this batch"}”?`}
        description="This permanently removes the batch, its exams and all attempts. Students themselves are kept (they may belong to other batches). This cannot be undone."
        confirmLabel="Delete batch"
        onConfirm={async () => {
          if (deleting) await removeBatch(deleting);
        }}
      />
    </>
  );
}
