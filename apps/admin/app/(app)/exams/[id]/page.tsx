"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExamComposeDialog } from "@/components/exam-compose-dialog";
import { PageBody, PageHeader } from "@/components/page-header";
import { QUESTION_TYPE_LABELS } from "@/lib/question-form";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  Pencil,
  Radio,
  Share2,
  Square,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ApiError,
  examApi,
  joinUrl,
  type ExamDetail,
  type ExamLiveState,
  type PaperItem,
} from "@/lib/api";

export default function ExamDetailPage() {
  const params = useParams<{ id: string }>();
  const examId = params.id;

  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirm, setConfirm] = useState<"publish" | "close" | null>(null);
  const [pending, setPending] = useState(false);
  const [live, setLive] = useState<ExamLiveState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setExam(await examApi.get(examId));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not load the exam");
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll the live roster while the exam is running.
  useEffect(() => {
    if (exam?.status !== "published") {
      setLive(null);
      return;
    }
    let active = true;
    const tick = async () => {
      try {
        const state = await examApi.live(examId);
        if (active) setLive(state);
      } catch {
        /* transient — keep the last snapshot */
      }
    };
    void tick();
    const timer = setInterval(tick, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [exam?.status, examId]);

  async function onConfirm() {
    if (!confirm) return;
    setPending(true);
    try {
      if (confirm === "publish") {
        await examApi.publish(examId);
        toast.success("Exam published — share the link");
      } else {
        await examApi.close(examId);
        toast.success("Exam closed");
      }
      setConfirm(null);
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Action failed");
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    if (!exam) return;
    try {
      await navigator.clipboard.writeText(joinUrl(exam.joinCode));
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <>
      <PageHeader
        title={exam?.title ?? "Exam"}
        description={exam ? `${exam.batchName} · ${exam.questionCount} questions · ${exam.maxScore} marks` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/exams">
                <ArrowLeft className="size-4" /> All exams
              </Link>
            </Button>
            {exam?.status === "draft" && (
              <>
                <Button variant="outline" size="sm" onClick={() => setComposeOpen(true)}>
                  <Pencil className="size-4" /> Questions
                </Button>
                <Button size="sm" onClick={() => setConfirm("publish")}>
                  <CheckCircle2 className="size-4" /> Publish
                </Button>
              </>
            )}
            {exam?.status === "published" && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
                  <Share2 className="size-4" /> Share
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setConfirm("close")}>
                  <Square className="size-4" /> Close now
                </Button>
              </>
            )}
          </div>
        }
      />
      <PageBody>
        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : !exam ? (
          <p className="text-muted-foreground text-sm">Exam not found.</p>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Status" value={<Badge>{exam.status}</Badge>} />
              <Stat
                label="Opens"
                value={new Date(exam.startsAt).toLocaleString()}
              />
              <Stat label="Closes" value={new Date(exam.endsAt).toLocaleString()} />
              <Stat label="Per student" value={`${exam.durationMinutes} min`} />
            </div>

            {exam.status !== "draft" && (
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2">
                    <Radio className="size-4" /> Live
                  </CardTitle>
                  <Badge variant="secondary">
                    {live?.participants.filter((p) => p.status === "in_progress").length ?? 0} in progress
                  </Badge>
                </CardHeader>
                <CardContent>
                  {!live || live.participants.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No students have joined yet. Share the link when they are seated.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Roll no</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Answered</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {live.participants.map((p) => (
                          <TableRow key={p.attemptId}>
                            <TableCell className="font-mono text-xs">{p.rollNo}</TableCell>
                            <TableCell>{p.name}</TableCell>
                            <TableCell>
                              <Badge variant={p.status === "in_progress" ? "secondary" : "success"}>
                                {p.status.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {p.answeredCount}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Paper ({exam.paper.length})</CardTitle>
                {exam.status === "draft" && (
                  <Button variant="outline" size="sm" onClick={() => setComposeOpen(true)}>
                    <Pencil className="size-4" /> Edit questions
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {exam.paper.length === 0 ? (
                  <div className="border-border flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center">
                    <p className="text-muted-foreground text-sm">
                      No questions yet. Add them before publishing.
                    </p>
                    <Button onClick={() => setComposeOpen(true)}>
                      <Pencil className="size-4" /> Add questions
                    </Button>
                  </div>
                ) : (
                  <ul className="divide-y">
                    {exam.paper.map((item: PaperItem) => (
                      <li key={item.questionId} className="flex items-start gap-3 py-3">
                        <span className="text-muted-foreground w-6 pt-0.5 text-sm tabular-nums">
                          {item.position + 1}.
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm">{item.question.prompt}</p>
                          <p className="text-muted-foreground mt-0.5 text-xs">
                            {QUESTION_TYPE_LABELS[item.question.type]}
                          </p>
                        </div>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {item.marks} mark{item.marks === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </PageBody>

      {exam && (
        <>
          <ExamComposeDialog
            open={composeOpen}
            onOpenChange={setComposeOpen}
            examId={exam.id}
            initialPaper={exam.paper}
            onComposed={({ paper, maxScore }) => setExam({ ...exam, paper, maxScore, questionCount: paper.length })}
          />

          <Dialog open={shareOpen} onOpenChange={setShareOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Share this exam</DialogTitle>
                <DialogDescription>
                  Students open the link, enter their name and roll number, and start.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="bg-muted flex items-center justify-between gap-2 rounded-md border p-3">
                  <code className="truncate text-sm">{exam && joinUrl(exam.joinCode)}</code>
                  <Button size="sm" variant="ghost" onClick={() => void copyLink()}>
                    <Copy className="size-4" />
                  </Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Join code</span>
                  <span className="font-mono text-base tracking-widest">{exam?.joinCode}</span>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => void copyLink()}>
                  <Copy className="size-4" /> Copy link
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {confirm === "publish" ? "Publish this exam?" : "Close this exam now?"}
                </DialogTitle>
                <DialogDescription>
                  {confirm === "publish"
                    ? "The paper is frozen and the link goes live. Past report cards can never change after this."
                    : "Anyone still working is timed out and no one else can join."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
                <Button
                  variant={confirm === "close" ? "destructive" : "default"}
                  onClick={() => void onConfirm()}
                  disabled={pending}
                >
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  {confirm === "publish" ? "Publish" : "Close exam"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card className="py-4">
      <CardContent className="space-y-1 px-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <div className="text-sm font-medium">{value}</div>
      </CardContent>
    </Card>
  );
}
