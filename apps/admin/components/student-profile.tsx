"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ApiError, reportApi, type StudentReportData } from "@/lib/api";

/**
 * Unified student profile: full exam history across ALL batches,
 * with batch tabs. `activeBatchId` selects the initial tab.
 */
export function StudentProfile({
  studentId,
  activeBatchId,
  open,
  onOpenChange,
}: {
  studentId: string | null;
  activeBatchId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [report, setReport] = useState<StudentReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<string>("all");

  useEffect(() => {
    if (!open || !studentId) return;
    setLoading(true);
    setReport(null);
    reportApi
      .student(studentId)
      .then((r) => {
        setReport(r);
        setTab(activeBatchId ?? "all");
      })
      .catch((e) => toast.error(e instanceof ApiError ? e.message : "Could not load student"))
      .finally(() => setLoading(false));
  }, [open, studentId, activeBatchId]);

  const filtered = useMemo(() => {
    if (!report) return [];
    if (tab === "all") return report.history;
    if (tab === "missed") return [];
    return report.history.filter((h) => h.batchId === tab);
  }, [report, tab]);

  const pct = report && report.totals.maxScore > 0
    ? Math.round((report.totals.score / report.totals.maxScore) * 100)
    : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{report ? report.name : "Student"}</SheetTitle>
          <SheetDescription>
            {report ? (
              <>Roll {report.rollNo} · {report.examsTaken} taken · {report.examsMissed} missed</>
            ) : (
              "Loading history…"
            )}
          </SheetDescription>
        </SheetHeader>

        {loading || !report ? (
          <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading report card…
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg border p-2">
                <p className="text-lg font-semibold">{pct}%</p>
                <p className="text-muted-foreground text-[11px]">overall</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-lg font-semibold tabular-nums">{report.totals.score}</p>
                <p className="text-muted-foreground text-[11px]">/ {report.totals.maxScore}</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-lg font-semibold tabular-nums">{report.totals.correct}</p>
                <p className="text-muted-foreground text-[11px]">correct</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-lg font-semibold tabular-nums">{report.totals.unattempted}</p>
                <p className="text-muted-foreground text-[11px]">skipped</p>
              </div>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex flex-wrap">
                <TabsTrigger value="all">All batches</TabsTrigger>
                {report.batches.map((b) => (
                  <TabsTrigger key={b.id} value={b.id}>
                    {b.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {filtered.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No exams in this view yet.
              </p>
            ) : (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exam</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((h) => (
                      <TableRow key={h.attemptId}>
                        <TableCell>
                          <p className="font-medium">{h.examTitle}</p>
                          <p className="text-muted-foreground text-xs">
                            {h.batchName} · {new Date(h.takenAt).toLocaleDateString()}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={h.status === "submitted" ? "success" : "secondary"}>
                            {h.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {h.score}/{h.maxScore}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={() => window.print()}>
              Print report card
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
