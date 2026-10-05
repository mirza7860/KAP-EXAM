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
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PaperBuilder, type SourceDraft } from "@/components/paper-builder";
import { PageBody, PageHeader } from "@/components/page-header";
import { QUESTION_TYPE_LABELS } from "@/lib/question-form";
import { MathText } from "@kap-exam/ui";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Eye,
  Loader2,
  Pencil,
  Radio,
  Share2,
  Square,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ApiError,
  examApi,
  joinUrl,
  mediaUrl,
  type ExamDetail,
  type ExamLiveState,
  type PaperItem,
} from "@/lib/api";

export default function ExamDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const examId = params.id;

  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingPaper, setEditingPaper] = useState(false);
  const [sources, setSources] = useState<SourceDraft[]>([]);
  const [savingPaper, setSavingPaper] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirm, setConfirm] = useState<"publish" | "close" | "reveal" | null>(null);
  const [live, setLive] = useState<ExamLiveState | null>(null);

  // `loading` starts true and this only settles it; onConfirm re-fetches from
  // an event handler where the page already has data worth keeping on screen.
  const load = useCallback(
    () =>
      examApi
        .get(examId)
        .then((next) => setExam(next))
        .catch((error) => {
          toast.error(error instanceof ApiError ? error.message : "Could not load the exam");
        })
        .finally(() => setLoading(false)),
    [examId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Poll the live roster while the exam is running. Nothing to clear when it
  // stops: the snapshot is read through `liveState`, which ignores a roster
  // for an exam that is no longer open.
  useEffect(() => {
    if (exam?.status !== "published") return;
    let active = true;
    const tick = async () => {
      try {
        const state = await examApi.live(examId);
        if (active) setLive(state);
      } catch {
        /* transient - keep the last snapshot */
      }
    };
    void tick();
    const timer = setInterval(tick, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [exam?.status, examId]);

  // The roster only means something while the exam is open. A closed exam
  // keeps the last snapshot in state but reads it through this, so nothing
  // has to be cleared from an effect.
  const liveState = exam?.status === "published" ? live : null;

  // Closing the tab does not end an attempt - the DO keeps it, and that is the
  // anti-cheat model. But the student stops heartbeating, so past the grace
  // window they should read as gone rather than "in progress" forever.
  const graceMs = (liveState?.config?.heartbeatGraceSeconds ?? 45) * 1000;
  const hasLeft = (p: { status: string; lastSeenAt: number }) =>
    p.status === "in_progress" && !!liveState && liveState.serverNow - p.lastSeenAt > graceMs;

  async function onConfirm() {
    if (!confirm) return;
    // ConfirmDialog owns the spinner: it awaits this and disables itself, so
    // there is no second copy of that flag to keep in sync here.
    try {
      if (confirm === "publish") {
        await examApi.publish(examId);
        toast.success("Exam published — showing the join code");
        setConfirm(null);
        router.push(`/host/${examId}`);
        return;
      }
      if (confirm === "close") {
        await examApi.close(examId);
        toast.success("Exam closed");
      } else {
        await examApi.reveal(examId);
        toast.success("Answers released — marks and the leaderboard are live");
      }
      setConfirm(null);
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Action failed");
    }
  }

  /** Clear an exit-limit lock. The next poll picks up the new roster. */
  async function onUnlock(attemptId: string, name: string) {
    try {
      await examApi.unlock(examId, attemptId);
      setLive(await examApi.live(examId));
      toast.success(`${name} can carry on - the lock is cleared`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not unlock");
    }
  }

  async function savePaper() {
    if (!exam || sources.length === 0) return;
    setSavingPaper(true);
    try {
      const result = await examApi.compose(exam.id, {
        sources: sources.map((source) =>
          source.kind === "questions"
            ? { kind: "questions", questionIds: source.questionIds }
            : source.kind === "subtopic"
              ? { kind: "subtopic", subtopicId: source.subtopicId, count: source.count }
              : { kind: "topic", topicId: source.topicId, count: source.count },
        ),
      });
      setEditingPaper(false);
      await load();
      toast.success(`Paper saved — ${result.questionCount} questions`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not save");
    } finally {
      setSavingPaper(false);
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
        description={exam ? `${exam.batchName} · ${exam.paper.length} questions · ${exam.maxScore} marks` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/exams">
                <ArrowLeft className="size-4" /> All exams
              </Link>
            </Button>
            {exam?.status === "draft" && (
              <>
                <Button variant="outline" size="sm" onClick={() => {
                  setSources([]);
                  setEditingPaper(true);
                }}>
                  <Pencil className="size-4" /> Questions
                </Button>
                <Button size="sm" onClick={() => setConfirm("publish")}>
                  <CheckCircle2 className="size-4" /> Publish
                </Button>
              </>
            )}
            {exam && (exam.status === "published" || (exam.status === "closed" && !!exam.revealedAt)) && (
              <Button size="sm" asChild>
                <Link href={`/host/${exam.id}`}>
                  <Radio className="size-4" /> Display
                </Link>
              </Button>
            )}
            {exam?.status === "published" && (
              <>
                <Button size="sm" onClick={() => setShareOpen(true)}>
                  <Share2 className="size-4" /> Share
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setConfirm("close")}>
                  <Square className="size-4" /> Close now
                </Button>
              </>
            )}
            {exam && exam.status !== "draft" && (
              exam.revealedAt ? (
                <Badge variant="success" className="h-8 px-3">
                  Answers released
                </Badge>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setConfirm("reveal")}>
                  <Eye className="size-4" /> Reveal answers
                </Button>
              )
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
                    {liveState?.participants.filter((p) => p.status === "in_progress" && !hasLeft(p)).length ?? 0} in progress
                  </Badge>
                </CardHeader>
                <CardContent>
                  {!liveState || liveState.participants.length === 0 ? (
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
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {liveState.participants.map((p) => (
                          <TableRow key={p.attemptId}>
                            <TableCell className="font-mono text-xs">{p.rollNo}</TableCell>
                            <TableCell>{p.name}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  p.status === "locked"
                                    ? "destructive"
                                    : p.status === "in_progress"
                                      ? hasLeft(p)
                                        ? "outline"
                                        : "secondary"
                                      : "success"
                                }
                              >
                                {p.status === "locked"
                                  ? "locked"
                                  : hasLeft(p)
                                    ? "left"
                                    : p.status.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {p.answeredCount}
                            </TableCell>
                            <TableCell className="text-right">
                              {p.status === "locked" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void onUnlock(p.attemptId, p.name)}
                                >
                                  Unlock
                                </Button>
                              )}
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
                {exam.status === "draft" && !editingPaper && (
                  <Button variant="outline" size="sm" onClick={() => {
                    setSources([]);
                    setEditingPaper(true);
                  }}>
                    <Pencil className="size-4" /> Edit questions
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {editingPaper ? (
                  <div className="space-y-4">
                    <PaperBuilder sources={sources} onChange={setSources} />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setEditingPaper(false)}>
                        Cancel
                      </Button>
                      <Button onClick={() => void savePaper()} disabled={savingPaper || sources.length === 0}>
                        {savingPaper && <Loader2 className="size-4 animate-spin" />}
                        Save paper
                      </Button>
                    </div>
                  </div>
                ) : exam.paper.length === 0 ? (
                  <div className="border-border flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center">
                    <p className="text-muted-foreground text-sm">
                      No questions yet. Add them before publishing.
                    </p>
                    <Button onClick={() => {
                      setSources([]);
                      setEditingPaper(true);
                    }}>
                      <Pencil className="size-4" /> Add questions
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-muted-foreground mb-3 text-xs">
                      Answers and explanations — students never see this page. It is here for
                      when a script is disputed and you need to show why an option is right.
                    </p>
                    <ul className="divide-y">
                      {exam.paper.map((item: PaperItem, index: number) => (
                        <PaperAnswer
                          key={item.questionId}
                          n={index + 1}
                          item={item}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </PageBody>

      {exam && (
        <>
          <Dialog open={shareOpen} onOpenChange={setShareOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Share this exam</DialogTitle>
                <DialogDescription>
                  Students open the link and enter just their roll number — names come from the roster.
                </DialogDescription>
              </DialogHeader>
              {/* min-w-0 belongs on the grid item, not the row inside it: this
                  is the element that sizes to the nowrap URL's max-content and
                  pushes the dialog wider than its own max-w. */}
              <div className="min-w-0 space-y-3">
                {/* min-w-0: without it this row's min-width resolves to the
                    nowrap URL's full width, so a long student URL (the real
                    production one is 49 chars) pushes the row out past the
                    dialog edge instead of letting the code truncate. */}
                <div className="bg-muted flex min-w-0 items-center justify-between gap-2 rounded-md border p-3">
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

          <ConfirmDialog
            open={confirm !== null}
            onOpenChange={(open) => !open && setConfirm(null)}
            title={
              confirm === "publish"
                ? "Publish this exam?"
                : confirm === "reveal"
                  ? "Reveal answers to students?"
                  : "Close this exam now?"
            }
            description={
              confirm === "publish"
                ? "The paper is frozen and the link goes live. Past report cards can never change after this."
                : confirm === "reveal"
                  ? "Every student immediately gets their marks, the correct answer to each question and the explanation. This cannot be undone — check everyone has finished first."
                  : "Anyone still working is timed out and no one else can join."
            }
            confirmLabel={
              confirm === "publish" ? "Publish" : confirm === "reveal" ? "Reveal answers" : "Close exam"
            }
            destructive={confirm === "close"}
            onConfirm={onConfirm}
          />
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

/**
 * One paper item with its answer key: the options with the right one marked,
 * the numeric answer and tolerance, and the explanation — the evidence a
 * teacher can put on screen when a student disputes a mark.
 */
function PaperAnswer({ n, item }: { n: number; item: PaperItem }) {
  const q = item.question;
  const isChoice = q.options.length > 0;

  return (
    <li className="flex items-start gap-3 py-4">
      <span className="text-muted-foreground w-6 pt-0.5 text-sm tabular-nums">{n}.</span>

      <div className="min-w-0 flex-1 space-y-2.5">
        <p className="text-sm leading-relaxed">
          <MathText>{q.prompt}</MathText>
        </p>

        {q.mediaKey && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(q.mediaKey)}
            alt="Question diagram"
            className="border-border h-28 rounded-md border object-contain"
          />
        )}

        <p className="text-muted-foreground text-xs">
          {QUESTION_TYPE_LABELS[q.type]}
          {q.negativeMarks > 0 ? ` · −${q.negativeMarks} for a wrong answer` : ""}
        </p>

        {isChoice && (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {q.options.map((option, index) => {
              const correct = q.correctOptionIds.includes(option.id);
              return (
                <li
                  key={option.id}
                  className={
                    "flex items-start gap-2 rounded-md px-2.5 py-1.5 text-sm " +
                    (correct
                      ? "border border-emerald-500/40 bg-emerald-500/10 font-medium"
                      : "border border-transparent bg-muted/40")
                  }
                >
                  {correct ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <span className="text-muted-foreground mt-0.5 w-4 shrink-0 text-xs tabular-nums">
                      {String.fromCharCode(65 + index)}
                    </span>
                  )}
                  <span className="min-w-0">
                    <MathText>{option.text}</MathText>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {q.type === "true_false" && (
          <p className="text-sm">
            <span className="eyebrow mr-2">Answer</span>
            <span className="font-medium">
              {q.correctOptionIds[0] === "true" ? "True" : "False"}
            </span>
          </p>
        )}

        {q.type === "numeric" && (
          <p className="text-sm">
            <span className="eyebrow mr-2">Answer</span>
            <span className="font-mono font-medium tabular-nums">
              {q.correctNumber}
              {q.numericTolerance !== null ? ` ± ${q.numericTolerance}` : ""}
            </span>
          </p>
        )}

        {q.explanation && (
          <div className="bg-muted/40 rounded-md border border-dashed border-border/80 px-3 py-2">
            <p className="eyebrow mb-1">Why</p>
            <p className="text-sm leading-relaxed">
              <MathText>{q.explanation}</MathText>
            </p>
          </div>
        )}
      </div>

      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {item.marks} mark{item.marks === 1 ? "" : "s"}
      </span>
    </li>
  );
}
