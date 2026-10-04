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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageBody, PageHeader } from "@/components/page-header";
import { StudentProfile } from "@/components/student-profile";
import { Loader2, Printer } from "lucide-react";
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
  const [examId, setExamId] = useState("");
  const [report, setReport] = useState<ExamReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    examApi
      .list()
      .then((list) => {
        setExams(list);
        setExamId((cur) => cur || list[0]?.id || "");
      })
      .catch(() => toast.error("Could not load exams"));
  }, []);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      setReport(await reportApi.exam(id));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (examId) void load(examId);
  }, [examId, load]);

  const attempted = report?.results.filter((r) => r.attemptId) ?? [];
  const avg =
    attempted.length > 0
      ? attempted.reduce((s, r) => s + r.score, 0) / attempted.length
      : 0;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Per-exam rosters (ascending) and per-student cards."
        actions={
          <div className="flex items-center gap-2">
            <Select value={examId} onValueChange={setExamId}>
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
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" /> Print
            </Button>
          </div>
        }
      />
      <PageBody>
        {loading || !report ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading report…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                <strong>{report.examTitle}</strong> · {report.batchName}
              </span>
              <span className="text-muted-foreground">
                {attempted.length}/{report.results.length} appeared · avg {avg.toFixed(1)}/
                {report.maxScore}
              </span>
            </div>
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Roll no</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">C / W / S</TableHead>
                    <TableHead className="text-right">Score</TableHead>
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
                                : "secondary"
                          }
                        >
                          {r.attemptId ? r.status.replace("_", " ") : "absent"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
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
              correct/wrong/skipped.
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
