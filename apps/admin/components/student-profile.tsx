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
import { Pagination } from "@/components/pagination";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError, reportApi, type StudentReportData } from "@/lib/api";

const PAGE_SIZE = 15;

/**
 * Unified student profile: full exam history across ALL batches, with batch
 * tabs. `activeBatchId` selects the initial tab.
 *
 * The batch tab is a *server* filter — each tab pages its own slice of the
 * history instead of slicing one already-paged response in the browser. The
 * summary figures at the top always describe the whole history.
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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {/* Radix unmounts this when the sheet closes, so the body always starts
            fresh: the batch you came from, page one, no report yet. */}
        {studentId && <ProfileBody studentId={studentId} activeBatchId={activeBatchId} />}
      </SheetContent>
    </Sheet>
  );
}

function ProfileBody({ studentId, activeBatchId }: { studentId: string; activeBatchId?: string }) {
  const [report, setReport] = useState<StudentReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>(activeBatchId ?? "all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const batchId = tab !== "all" && tab !== "missed" ? tab : undefined;
    reportApi
      .student(studentId, { limit, offset, batchId })
      .then((r) => setReport(r))
      .catch((e) => toast.error(e instanceof ApiError ? e.message : "Could not load student"))
      .finally(() => setLoading(false));
  }, [studentId, tab, limit, offset]);

  const history = report?.history ?? [];
  const missed = report?.missedExams ?? [];
  const rowsEmpty = tab === "missed" ? missed.length === 0 : history.length === 0;

  if (!report) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>Student</SheetTitle>
          <SheetDescription>Loading history…</SheetDescription>
        </SheetHeader>
        <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading report card…
        </div>
      </>
    );
  }

  const pct =
    report.totals.maxScore > 0
      ? Math.round((report.totals.score / report.totals.maxScore) * 100)
      : 0;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{report.name}</SheetTitle>
        <SheetDescription>
          Roll <span className="font-mono">{report.rollNo}</span> · {report.examsTaken} taken ·{" "}
          {report.examsMissed} missed
        </SheetDescription>
      </SheetHeader>

      {/* SheetContent already supplies the column gap, and this column fills the drawer —
          so the stat row aligns with the header and the print action lands at the
          bottom instead of leaving a void under the tabs. */}
      <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          <StatCard figure={`${pct}%`} label="overall" />
          <StatCard
            figure={report.totals.score}
            label={report.totals.maxScore > 0 ? `of ${report.totals.maxScore} marks` : "marks"}
          />
          <StatCard figure={report.totals.correct} label="correct" />
          <StatCard figure={report.totals.unattempted} label="skipped" />
        </div>

        <Tabs
          value={tab}
          onValueChange={(next) => {
            setTab(next);
            setOffset(0);
            setLoading(true);
          }}
        >
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="all">All batches</TabsTrigger>
            {report.batches.map((b) => (
              <TabsTrigger key={b.id} value={b.id}>
                {b.name}
              </TabsTrigger>
            ))}
            {report.examsMissed > 0 && (
              <TabsTrigger value="missed">Missed ({report.examsMissed})</TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        {/* This region absorbs the drawer's remaining height: a student with no
            history gets a centred empty state instead of a hole under the tabs. */}
        <div className="flex flex-1 flex-col">
          {loading ? (
            <div className="text-muted-foreground flex flex-1 items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : rowsEmpty ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-muted-foreground text-sm">
                {tab === "missed"
                  ? "Nothing missed — they have sat every exam given to their batches."
                  : "No exams in this view yet."}
              </p>
            </div>
          ) : tab === "missed" ? (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Exam</TableHead>
                    <TableHead className="text-right">Given on</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missed.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <p className="font-medium">{m.title}</p>
                        <p className="text-muted-foreground text-xs">{m.batchName}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right text-xs">
                        {new Date(m.startsAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <>
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
                    {history.map((h) => (
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
              <Pagination
                total={report.total ?? history.length}
                limit={report.limit ?? limit}
                offset={report.offset ?? offset}
                noun="exams"
                onChange={({ limit: nextLimit, offset: nextOffset }) => {
                  setLimit(nextLimit);
                  setOffset(nextOffset);
                  setLoading(true);
                }}
              />
            </>
          )}
        </div>

        <Button variant="outline" className="w-full" onClick={() => window.print()}>
          Print report card
        </Button>
      </div>
    </>
  );
}

/**
 * A single numeric fact. Display face, so a row of four of these reads as a
 * line of figures rather than four boxes of body text.
 */
function StatCard({ figure, label }: { figure: ReactNode; label: string }) {
  return (
    <div className="rounded-lg border bg-card px-2 py-2.5">
      <p className="stat-figure text-xl leading-none font-semibold">{figure}</p>
      <p className="text-muted-foreground mt-1.5 text-[11px] leading-tight">{label}</p>
    </div>
  );
}
