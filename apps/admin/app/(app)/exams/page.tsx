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
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/page-header";
import { ClipboardList, Plus } from "lucide-react";
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
  const [batchCount, setBatchCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [examList, batchList] = await Promise.all([examApi.list(), batchApi.list()]);
      setExams(examList);
      setBatchCount(batchList.length);
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
        description="Create an exam, share the QR in class, watch them join."
        actions={
          <Button asChild disabled={batchCount === 0}>
            <Link href="/exams/new">
              <Plus className="size-4" /> New exam
            </Link>
          </Button>
        }
      />
      <PageBody>
        {loading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : batchCount === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title="Create a batch first"
            description="Every exam belongs to a batch — the group of students who sit it."
            action={
              <Button asChild>
                <Link href="/batches">Go to batches</Link>
              </Button>
            }
          />
        ) : exams.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title="No exams yet"
            description="Pick a topic or subtopic, take 10 or 15 questions, then share the QR in class. An exam takes a minute to set up."
            action={
              <Button asChild>
                <Link href="/exams/new">
                  <Plus className="size-4" /> New exam
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="eyebrow">Exam</TableHead>
                  <TableHead className="eyebrow hidden md:table-cell">Batch</TableHead>
                  <TableHead className="eyebrow">Status</TableHead>
                  <TableHead className="eyebrow hidden lg:table-cell">Window</TableHead>
                  <TableHead className="eyebrow w-16 text-right">Q</TableHead>
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
    </>
  );
}
