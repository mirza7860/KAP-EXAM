import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Logo, MathText, Progress, Separator, Toaster, toast } from "@kap-exam/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { codeFromLocation, mediaUrl, studentApi, StudentApiError, type JoinData, type ReviewItem } from "./lib/api";

type Phase = "join" | "exam" | "done";

function formatLeft(ms: number): string {
  if (ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("join");
  const [code, setCode] = useState(() => codeFromLocation());
  const [roll, setRoll] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [join, setJoin] = useState<JoinData | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { selectedOptionIds: string[]; numericValue: number | null }>>({});
  const [numericDraft, setNumericDraft] = useState("");
  const [result, setResult] = useState<{ score: number; maxScore: number; correct: number; wrong: number; unattempted: number } | null>(null);
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [examTitle, setExamTitle] = useState<string | null>(null);
  const [alreadyFinished, setAlreadyFinished] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const deadline = join?.participant.deadlineAt ?? 0;
  const left = deadline ? deadline - (Date.now() + clockOffset) : 0;

  // clock tick
  useEffect(() => {
    if (phase !== "exam") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);
  void now;

  /**
   * Marks and the answer key only exist once the teacher releases them —
   * `GET /attempts/:id` answers `revealed: false` with no breakdown until
   * then. So a submitted student sits in a waiting state that quietly checks
   * back, and their screen flips over the moment the reveal lands.
   */
  const refreshResult = useCallback(async (id: string) => {
    try {
      const prev = await studentApi.attempt(id);
      if (!prev.revealed) return;
      setResult(prev.result);
      setReview(prev.review);
      setRevealed(true);
      if (prev.student?.name) setName(prev.student.name);
      if (prev.exam?.title) setExamTitle(prev.exam.title);
    } catch {
      /* transient — the next tick will catch up */
    }
  }, []);

  useEffect(() => {
    if (phase !== "done" || revealed || !attemptId) return;
    void refreshResult(attemptId);
    const t = setInterval(() => void refreshResult(attemptId), 5000);
    return () => clearInterval(t);
  }, [phase, revealed, attemptId, refreshResult]);

  // auto-submit at deadline
  useEffect(() => {
    if (phase !== "exam" || !join || left > 0) return;
    void doSubmit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, left]);

  // heartbeat
  useEffect(() => {
    if (phase !== "exam" || !join) return;
    const answered = Object.keys(answers).length;
    const beat = () => {
      studentApi.heartbeat(join.attemptId, answered).catch(() => undefined);
    };
    beat();
    const t = setInterval(beat, 15000);
    return () => clearInterval(t);
  }, [phase, join, answers]);

  // violation signals (review-only, never blocking)
  useEffect(() => {
    if (phase !== "exam" || !join) return;
    const id = join.attemptId;
    let lastSent = 0;
    const send = (type: string) => {
      const t = Date.now();
      if (t - lastSent < 5000) return;
      lastSent = t;
      void studentApi.violation(id, type);
    };
    const onVis = () => {
      if (document.hidden) send("visibility_hidden");
    };
    const onBlur = () => send("window_blur");
    const onCopy = () => send("copy");
    const onPaste = () => send("paste");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [phase, join]);

  useEffect(() => {
    if (phase !== "exam" || !join) return;
    const q = join.paper[index];
    if (q?.type === "numeric") {
      setNumericDraft(answers[q.id]?.numericValue?.toString() ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, phase]);

  async function onLookup(e?: React.FormEvent) {
    e?.preventDefault();
    if (!code.trim() || !roll.trim()) {
      toast.error("Enter the exam code and your roll number");
      return;
    }
    setBusy(true);
    try {
      const found = await studentApi.lookup(code.trim().toUpperCase(), roll.trim());
      setName(found.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  async function onStart() {
    setBusy(true);
    try {
      const data = await studentApi.join(code.trim().toUpperCase(), roll.trim());
      setJoin(data);
      setAnswers(data.answers ?? {});
      setClockOffset(data.serverNow - Date.now());
      setIndex(0);
      setName(data.student.name);
      setExamTitle(data.exam.title);
      setAlreadyFinished(false);
      setPhase("exam");
    } catch (err) {
      // Friendly rejoin: a finished attempt shows its score instead of a raw error.
      if (err instanceof StudentApiError && (err.code === "already_submitted" || err.code === "attempt_locked")) {
        const savedId = err.fields?.attemptId?.[0];
        if (savedId) {
          try {
            const prev = await studentApi.attempt(savedId);
            if (prev.attempt.status !== "in_progress") {
              setAttemptId(savedId);
              setResult(prev.result);
              setReview(prev.review);
              setRevealed(prev.revealed);
              setName(prev.student?.name ?? name);
              if (prev.exam?.title) setExamTitle(prev.exam.title);
              setAlreadyFinished(true);
              setPhase("done");
              return;
            }
          } catch {
            /* fall through to the message */
          }
        }
        toast.message(
          err.code === "attempt_locked"
            ? "This exam is locked to the device you started on. Please continue there."
            : "You have already finished this exam. Your answers are with your teacher.",
        );
        return;
      }
      // Arrived before the window opened: the API sends when it does, so the
      // student gets a clock time in their own timezone instead of "closed".
      if (err instanceof StudentApiError && err.code === "windowClosed") {
        const opensAt = err.fields?.opensAt?.[0];
        if (opensAt) {
          const t = new Date(opensAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          toast.error(`This exam hasn't opened yet — it opens at ${t}`);
          return;
        }
      }
      toast.error(err instanceof Error ? err.message : "Could not start");
    } finally {
      setBusy(false);
    }
  }

  const saveAnswer = useCallback(
    (questionId: string, value: { selectedOptionIds: string[]; numericValue: number | null }) => {
      if (!join) return;
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
      const prev = saveTimers.current[questionId];
      if (prev) clearTimeout(prev);
      saveTimers.current[questionId] = setTimeout(() => {
        studentApi
          .answer(join.attemptId, questionId, value.selectedOptionIds, value.numericValue)
          .catch(() => undefined);
      }, 600);
    },
    [join],
  );

  async function doSubmit(auto = false) {
    if (!join || busy) return;
    setBusy(true);
    try {
      await studentApi.submit(join.attemptId);
      setAttemptId(join.attemptId);
      setPhase("done");
      // The response carries no score by design — this is what fetches the
      // result later, once the teacher has released the paper.
      void refreshResult(join.attemptId);
      if (auto) toast.message("Time is up — submitted automatically");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
      setConfirmSubmit(false);
    }
  }

  const questions = join?.paper ?? [];
  const current = questions[index];
  const answeredCount = Object.keys(answers).length;
  const progress = questions.length ? (answeredCount / questions.length) * 100 : 0;
  const urgent = left < 5 * 60_000;

  const palette = useMemo(
    () =>
      questions.map((q) => {
        const a = answers[q.id];
        const has = a && (a.selectedOptionIds.length > 0 || a.numericValue !== null);
        return { id: q.id, has: !!has };
      }),
    [questions, answers],
  );

  if (phase === "done") {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center gap-6 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo height={30} />
          <h1 className="display text-3xl font-semibold">
            {revealed ? "Your result" : alreadyFinished ? "Already submitted" : "Submitted"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {revealed
              ? (examTitle ?? "Your answers have been marked.")
              : alreadyFinished
                ? "Your answers are with your teacher."
                : "Your teacher has your answers."}
          </p>
        </div>

        {revealed && result ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="stat-figure text-center text-5xl">
                  {result.score}
                  <span className="text-muted-foreground text-xl">/{result.maxScore}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center gap-8 text-center text-sm">
                <span>
                  <strong className="stat-figure block text-xl">{result.correct}</strong>
                  <span className="text-muted-foreground">correct</span>
                </span>
                <span>
                  <strong className="stat-figure block text-xl">{result.wrong}</strong>
                  <span className="text-muted-foreground">wrong</span>
                </span>
                <span>
                  <strong className="stat-figure block text-xl">{result.unattempted}</strong>
                  <span className="text-muted-foreground">skipped</span>
                </span>
              </CardContent>
            </Card>

            {review && review.length > 0 && (
              <section className="space-y-3">
                <p className="eyebrow">Answer review</p>
                {review.map((item) => (
                  <ReviewCard key={item.questionId} item={item} />
                ))}
              </section>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="space-y-2 px-5 py-8 text-center">
              <p className="display text-2xl font-semibold">Waiting for results</p>
              <p className="text-muted-foreground mx-auto max-w-xs text-sm">
                Your answers are submitted. Your teacher will release the marks shortly — this
                screen updates on its own.
              </p>
              <p className="text-muted-foreground flex items-center justify-center gap-2 pt-3 text-xs">
                <span className="bg-primary inline-block size-1.5 animate-pulse rounded-full" />
                Checking for your result…
              </p>
            </CardContent>
          </Card>
        )}
        <Toaster />
      </main>
    );
  }

  if (phase === "exam" && join && current) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col">
        <header className="bg-background/90 sticky top-0 z-10 border-b backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{join.exam.title}</p>
              <p className="text-muted-foreground text-xs">{name} · Q{index + 1}/{questions.length}</p>
            </div>
            <Badge variant={urgent ? "destructive" : "secondary"} className="tabular-nums">
              {formatLeft(left)}
            </Badge>
          </div>
          <Progress value={progress} className="mx-4 mb-2" />
        </header>

        <main className="flex-1 space-y-4 p-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
          <Card>
            <CardContent className="space-y-4 pt-5">
              <div className="flex items-center justify-between">
                <Badge variant="secondary">{current.marks}m</Badge>
                <span className="text-muted-foreground text-xs">Question {index + 1}</span>
              </div>
              <p className="text-[15px] leading-relaxed">
                <MathText>{current.prompt}</MathText>
              </p>
              {current.mediaKey && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(current.mediaKey)} alt="Question diagram" className="max-h-64 w-full rounded-lg border object-contain" />
              )}

              {current.type === "numeric" ? (
                <div className="space-y-2">
                  <Label htmlFor="num">Your answer</Label>
                  <Input
                    id="num"
                    inputMode="decimal"
                    type="number"
                    step="any"
                    placeholder="Type the number"
                    value={numericDraft}
                    enterKeyHint={index < questions.length - 1 ? "next" : "done"}
                    onKeyDown={(e) => {
                      // The keyboard's Go/Next key should move on, the way it
                      // does everywhere else on a phone - otherwise the student
                      // has to dismiss the keyboard and hunt for Next.
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (index < questions.length - 1) setIndex((i) => i + 1);
                      else setConfirmSubmit(true);
                    }}
                    onChange={(e) => {
                      setNumericDraft(e.target.value);
                      const v = e.target.value.trim() === "" ? null : Number(e.target.value);
                      saveAnswer(current.id, {
                        selectedOptionIds: [],
                        numericValue: v !== null && Number.isFinite(v) ? v : null,
                      });
                    }}
                  />
                </div>
              ) : current.type === "true_false" ? (
                <div className="grid grid-cols-2 gap-3">
                  {current.options.map((o) => {
                    const sel = answers[current.id]?.selectedOptionIds.includes(o.id);
                    return (
                      <Button
                        key={o.id}
                        variant={sel ? "default" : "outline"}
                        className="h-14 text-base"
                        onClick={() => saveAnswer(current.id, { selectedOptionIds: [o.id], numericValue: null })}
                      >
                        {o.text}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {current.options.map((o, i) => {
                    const sel = answers[current.id]?.selectedOptionIds.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        onClick={() => {
                          const prev = answers[current.id]?.selectedOptionIds ?? [];
                          if (current.type === "mcq_single") {
                            saveAnswer(current.id, { selectedOptionIds: [o.id], numericValue: null });
                          } else {
                            const set = new Set(prev);
                            if (set.has(o.id)) set.delete(o.id);
                            else set.add(o.id);
                            saveAnswer(current.id, { selectedOptionIds: [...set], numericValue: null });
                          }
                        }}
                        className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left text-[15px] transition-colors ${
                          sel ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent"
                        }`}
                      >
                        <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${sel ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                          {String.fromCharCode(65 + i)}
                        </span>
                        <MathText>{o.text}</MathText>
                      </button>
                    );
                  })}
                  {current.type === "mcq_multi" && (
                    <p className="text-muted-foreground text-xs">More than one answer can be correct.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-1.5">
            {palette.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setIndex(i)}
                className={`size-9 rounded-lg border text-sm tabular-nums ${
                  i === index
                    ? "border-primary bg-primary text-primary-foreground font-semibold"
                    : p.has
                      ? "bg-primary/15 border-primary/40 font-medium"
                      : "text-muted-foreground"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </main>

        <footer className="bg-background/95 fixed inset-x-0 bottom-0 border-t backdrop-blur">
          {/* max() keeps normal padding on devices with no inset, and lifts the
              buttons above the Android navigation bar in standalone mode. */}
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
              Back
            </Button>
            {index < questions.length - 1 ? (
              <Button onClick={() => setIndex((i) => i + 1)}>Next</Button>
            ) : (
              <Button onClick={() => setConfirmSubmit(true)}>Submit</Button>
            )}
          </div>
        </footer>

        {confirmSubmit && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6">
            <Card className="w-full max-w-sm">
              <CardHeader>
                <CardTitle>Submit exam?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground text-sm">
                  {answeredCount}/{questions.length} answered · {questions.length - answeredCount} skipped.
                  You cannot change answers after this.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setConfirmSubmit(false)}>Keep writing</Button>
                  <Button onClick={() => void doSubmit(false)} disabled={busy}>Submit</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        <Toaster />
      </div>
    );
  }

  // Join phase
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo height={34} />
        <div className="space-y-1">
          <h1 className="display text-3xl font-semibold tracking-tight">Join your exam</h1>
          <p className="text-muted-foreground text-sm">Enter the code and your roll number.</p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="space-y-2">
            <Label htmlFor="code">Exam code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. JBT9JRNN"
              className="font-mono uppercase"
              autoComplete="off"
            />
          </div>
          <form
            onSubmit={(e) => {
              if (!name) void onLookup(e);
              else void onStart();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="roll">Roll number</Label>
              <Input
                id="roll"
                value={roll}
                onChange={(e) => {
                  setRoll(e.target.value);
                  setName(null);
                }}
                placeholder="e.g. R-01"
                autoComplete="off"
              />
            </div>
            {name ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                Welcome, <strong>{name}</strong>. Your timer starts when you begin.
                <Button className="mt-3 w-full" disabled={busy} onClick={() => void onStart()} type="button">
                  {busy ? "Starting…" : "Start exam"}
                </Button>
                <button
                  type="button"
                  className="text-muted-foreground mt-2 w-full text-center text-xs"
                  onClick={() => setName(null)}
                >
                  Not you? Check the roll number
                </button>
              </div>
            ) : (
              <Button className="w-full" disabled={busy} type="submit">
                {busy ? "Checking…" : "Continue"}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
      <Toaster />
    </main>
  );
}

/** What the student put down, as readable text. */
function yourAnswerText(item: ReviewItem): string {
  if (item.type === "numeric") {
    return item.yourNumericValue === null ? "Not answered" : String(item.yourNumericValue);
  }
  const chosen = item.options.filter((o) => item.yourSelectedOptionIds.includes(o.id));
  if (chosen.length === 0) return "Not answered";
  return chosen.map((o) => o.text).join("  ·  ");
}

/** The answer key, as readable text. */
function correctAnswerText(item: ReviewItem): string {
  if (item.type === "numeric") {
    const base = item.correctNumber ?? 0;
    const tolerance = item.numericTolerance ?? 0;
    return tolerance > 0 ? `${base} ± ${tolerance}` : String(base);
  }
  const right = item.options.filter((o) => item.correctOptionIds.includes(o.id));
  return right.length > 0 ? right.map((o) => o.text).join("  ·  ") : "—";
}

/**
 * One graded question. Shown only after the teacher releases the paper: what
 * you picked, what it should have been, what it was worth, and the
 * explanation if the bank has one.
 */
function ReviewCard({ item }: { item: ReviewItem }) {
  const skipped = item.isCorrect === null;
  const correct = item.isCorrect === true;
  const verdict = skipped ? "secondary" : correct ? "success" : "destructive";
  const label = skipped ? "Skipped" : correct ? "Correct" : "Incorrect";
  const edge = skipped
    ? "border-l-border"
    : correct
      ? "border-l-emerald-500"
      : "border-l-destructive";

  return (
    <Card className={`border-l-4 ${edge}`}>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-xs font-medium">
            Question {item.position + 1}
          </span>
          <Badge variant={verdict}>{label}</Badge>
        </div>

        <p className="text-[15px] leading-relaxed">
          <MathText>{item.prompt}</MathText>
        </p>
        {item.mediaKey && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(item.mediaKey)}
            alt="Question diagram"
            className="max-h-56 w-full rounded-lg border object-contain"
          />
        )}

        <div className="space-y-3 rounded-lg border p-3">
          <div>
            <p className="text-muted-foreground text-xs">You answered</p>
            <p
              className={`text-sm ${
                skipped
                  ? "text-muted-foreground italic"
                  : correct
                    ? ""
                    : "text-destructive font-medium"
              }`}
            >
              <MathText>{yourAnswerText(item)}</MathText>
            </p>
          </div>
          <Separator />
          <div>
            <p className="text-muted-foreground text-xs">Correct answer</p>
            <p className="text-sm font-medium">
              <MathText>{correctAnswerText(item)}</MathText>
            </p>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">Marks awarded</span>
            <span className="stat-figure text-base tabular-nums">
              {item.awardedMarks}
              <span className="text-muted-foreground text-xs">/{item.marks}</span>
            </span>
          </div>
        </div>

        {item.explanation && (
          <div className="bg-muted/70 rounded-lg p-3">
            <p className="eyebrow mb-1.5">Explanation</p>
            <p className="text-sm leading-relaxed">
              <MathText>{item.explanation}</MathText>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
