"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExamFormDialog } from "@/components/exam-form-dialog";
import { PageBody, PageHeader } from "@/components/page-header";
import { ClipboardList, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError, batchApi, examApi, type BatchSummary, type ExamSummary } from "@/lib/api";

function statusVariant(status: ExamSummary["status"]) {
  if (status === "published") return "success" as const;
  if (status === "closed") return "outline" as const;
  return "secondary" as const;
}

export default function ExamsPage() {
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [examList, batchList] = await Promise.all([examApi.list(), batchApi.list()]);
      setExams(examList);
      setBatches(batchList);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not load exams");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Exams"
        description="Compose, publish and monitor exams."
        actions={
          <Button onClick={() => setDialogOpen(true)} disabled={batches.length === 0}>
            <Plus className="size-4" /> New exam
          </Button>
        }
      />
      <PageBody>
        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading exams…
          </div>
        ) : batches.length === 0 ? (
          <div className="border-border flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <ClipboardList className="text-muted-foreground size-6" />
            <p className="text-muted-foreground text-sm">
              Create a batch first — every exam belongs to a batch.
            </p>
            <Button asChild>
              <Link href="/batches">Go to batches</Link>
            </Button>
          </div>
        ) : exams.length === 0 ? (
          <div className="border-border flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <ClipboardList className="text-muted-foreground size-6" />
            <p className="text-muted-foreground text-sm">No exams yet.</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" /> New exam
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead className="hidden md:table-cell">Batch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Window</TableHead>
                  <TableHead className="w-16 text-right">Q</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((exam) => (
                  <TableRow key={exam.id}>
                    <TableCell className="font-medium">{exam.title}</TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell">
                      {exam.batchName}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(exam.status)}>{exam.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
                      {new Date(exam.startsAt).toLocaleString()} →{" "}
                      {new Date(exam.endsAt).toLocaleTimeString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{exam.questionCount}</TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/exams/${exam.id}`}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageBody>

      <ExamFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        batches={batches}
        onCreated={(exam) => setExams((current) => [exam, ...current])}
      />
    </>
  );
}
