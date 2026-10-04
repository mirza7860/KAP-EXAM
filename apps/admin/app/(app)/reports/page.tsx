"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { StudentProfile } from "@/components/student-profile";
import { BarChart3, Printer } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ApiError,
  examApi,
  reportApi,
  type ExamReportData,
  type ExamSummary,
} from "@/lib/api";

export default function ReportsPage() {
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [examsLoaded, setExamsLoaded] = useState(false);
  const [examId, setExamId] = useState("");
  const [report, setReport] = useState<ExamReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    examApi
      .list()
      .then((list) => {
        setExams(list);
        setExamId((cur) => cur || list[0]?.id || "");
      })
      .catch(() => toast.error("Could not load exams"))
      .finally(() => setExamsLoaded(true));
  }, []);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await reportApi.exam(id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (examId) void load(examId);
  }, [examId, load]);

  const attempted = report?.results.filter((r) => r.attemptId) ?? [];
  const avg =
    attempted.length > 0 ? attempted.reduce((s, r) => s + r.score, 0) / attempted.length : 0;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Per-exam rosters (ascending) and per-student cards."
        actions={
          <div className="flex items-center gap-2">
            <Select value={examId} onValueChange={setExamId} disabled={exams.length === 0}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Choose an exam" />
              </SelectTrigger>
              <SelectContent>
                {exams.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.title} · {e.batchName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              disabled={!report}
            >
              <Printer className="size-4" /> Print
            </Button>
          </div>
        }
      />
      <PageBody>
        {!examsLoaded ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : exams.length === 0 ? (
          <EmptyState
            icon={<BarChart3 className="size-5" />}
            title="No exams to report on"
            description="Once you run an exam, every student's result lands here as a roster you can print."
            action={
              <Button asChild>
                <Link href="/exams/new">Create an exam</Link>
              </Button>
            }
          />
        ) : loading || !report ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-80" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : error ? (
          <EmptyState
            icon={<BarChart3 className="size-5" />}
            title="Couldn't load that report"
            description={error}
            action={
              <Button variant="outline" onClick={() => void load(examId)}>
                Try again
              </Button>
            }
          />
        ) : (
          <div className="enter-rise space-y-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="display text-lg font-semibold">{report.examTitle}</p>
              <p className="text-muted-foreground text-sm">
                {report.batchName} · {attempted.length}/{report.results.length} appeared · avg{" "}
                {avg.toFixed(1)}/{report.maxScore}
              </p>
            </div>
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="eyebrow">Roll no</TableHead>
                    <TableHead className="eyebrow">Name</TableHead>
                    <TableHead className="eyebrow">Status</TableHead>
                    <TableHead className="eyebrow text-right">C / W / S</TableHead>
                    <TableHead className="eyebrow text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.results.map((r) => (
                    <TableRow
                      key={r.studentId}
                      className="cursor-pointer"
                      onClick={() => r.studentId && setProfileId(r.studentId)}
                    >
                      <TableCell className="font-mono text-xs">{r.rollNo}</TableCell>
                      <TableCell className="font-medium">{r.studentName}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === "submitted"
                              ? "success"
                              : r.status === "abandoned"
                                ? "destructive"
                                : r.status === "timed_out"
                                  ? "warning"
                                  : "secondary"
                          }
                        >
                          {r.attemptId ? r.status.replace("_", " ") : "absent"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {r.correct}/{r.wrong}/{r.unattempted}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {r.attemptId ? `${r.score}/${r.maxScore}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-muted-foreground text-xs">
              Click a student for their unified report card across all batches. C/W/S =
              correct / wrong / skipped.
            </p>
          </div>
        )}
      </PageBody>

      <StudentProfile
        studentId={profileId}
        open={profileId !== null}
        onOpenChange={(open) => !open && setProfileId(null)}
      />
    </>
  );
}
