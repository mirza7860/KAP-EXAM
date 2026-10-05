"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Pagination } from "@/components/pagination";
import { StudentProfile } from "@/components/student-profile";
import { ArrowLeft, BarChart3, ChevronRight, Printer } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError, examApi, reportApi, type ExamReportData, type ExamSummary } from "@/lib/api";

const EXAM_PAGE = 20;
/** Rosters are read row by row, so pages stay short. */
const ROSTER_PAGE = 15;

function statusVariant(status: ExamSummary["status"]) {
  if (status === "published") return "success" as const;
  if (status === "closed") return "outline" as const;
  return "secondary" as const;
}

/**
 * Reports open on the list of exams, not on one report nobody asked for yet:
 * pick an exam, see its roster, come back. The roster itself pages through the
 * Worker — a full batch is never pulled down to render one screenful.
 */
export default function ReportsPage() {
  const [examId, setExamId] = useState<string | null>(null);

  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [examTotal, setExamTotal] = useState(0);
  const [examLimit, setExamLimit] = useState(EXAM_PAGE);
  const [examOffset, setExamOffset] = useState(0);
  const [listLoading, setListLoading] = useState(true);

  const [report, setReport] = useState<ExamReportData | null>(null);
  const [reportLimit, setReportLimit] = useState(ROSTER_PAGE);
  const [reportOffset, setReportOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  // `listLoading` starts true and is re-armed by the pager's onChange (an event
  // handler), so the effect only ever settles it.
  useEffect(() => {
    examApi
      .list({ limit: examLimit, offset: examOffset })
      .then((page) => {
        setExams(page.items);
        setExamTotal(page.total);
      })
      .catch(() => toast.error("Could not load exams"))
      .finally(() => setListLoading(false));
  }, [examLimit, examOffset]);

  const load = useCallback(async (id: string, offset: number, limit: number) => {
    setLoading(true);
    setError(null);
    try {
      setReport(await reportApi.exam(id, { offset, limit }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (examId) void load(examId, reportOffset, reportLimit);
  }, [examId, reportOffset, reportLimit, load]);

  const open = (id: string) => {
    setReport(null);
    setReportOffset(0);
    setExamId(id);
  };

  const summary = report?.summary;
  const appeared = summary?.appeared ?? report?.results.filter((r) => r.attemptId).length ?? 0;
  const totalStudents = summary?.totalStudents ?? report?.results.length ?? 0;
  const avg = summary?.avgScore ?? 0;
  const rosterTotal = report?.total ?? report?.results.length ?? 0;

  // ----- the exam picker --------------------------------------------------
  const picker = (
    <>
      {listLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : examTotal === 0 ? (
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
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="eyebrow">Exam</TableHead>
                  <TableHead className="eyebrow hidden md:table-cell">Batch</TableHead>
                  <TableHead className="eyebrow hidden lg:table-cell">Given on</TableHead>
                  <TableHead className="eyebrow">Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((exam) => (
                  <TableRow key={exam.id} className="cursor-pointer" onClick={() => open(exam.id)}>
                    <TableCell className="font-medium">{exam.title}</TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell">
                      {exam.batchName}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
                      {new Date(exam.startsAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(exam.status)}>{exam.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <ChevronRight className="text-muted-foreground size-4" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination
            total={examTotal}
            limit={examLimit}
            offset={examOffset}
            noun="exams"
            onChange={({ limit, offset }) => {
              setExamLimit(limit);
              setExamOffset(offset);
              setListLoading(true);
            }}
          />
        </>
      )}
    </>
  );

  // ----- one exam's roster ------------------------------------------------
  const detail = !examId ? null : loading && !report ? (
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
        <Button
          variant="outline"
          onClick={() => examId && void load(examId, reportOffset, reportLimit)}
        >
          Try again
        </Button>
      }
    />
  ) : !report ? (
    <Skeleton className="h-64 rounded-xl" />
  ) : (
    <div className="enter-rise space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="display text-lg font-semibold">{report.examTitle}</p>
        <p className="text-muted-foreground text-sm">
          {report.batchName} · {appeared}/{totalStudents} appeared · avg {avg.toFixed(1)}/
          {report.maxScore}
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
      <Pagination
        total={rosterTotal}
        limit={reportLimit}
        offset={reportOffset}
        noun="students"
        onChange={({ limit, offset }) => {
          setReportLimit(limit);
          setReportOffset(offset);
        }}
      />

      <p className="text-muted-foreground text-xs">
        Click a student for their unified report card across all batches. C/W/S = correct / wrong /
        skipped.
      </p>
    </div>
  );

  const current = exams.find((e) => e.id === examId) ?? null;

  return (
    <>
      <PageHeader
        title={current ? current.title : "Reports"}
        description={
          current
            ? `${current.batchName} · roster, ascending by roll no`
            : "Per-exam rosters and per-student cards. Pick an exam to open it."
        }
        actions={
          <div className="flex items-center gap-2">
            {examId ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setExamId(null)}>
                  <ArrowLeft className="size-4" /> All exams
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  disabled={!report}
                >
                  <Printer className="size-4" /> Print
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      <PageBody>{examId ? detail : picker}</PageBody>

      <StudentProfile
        studentId={profileId}
        open={profileId !== null}
        onOpenChange={(open) => !open && setProfileId(null)}
      />
    </>
  );
}
