"use client";

import { Medal } from "@/components/medal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  joinUrl,
  examApi,
  type ExamLiveState,
  type ExamDetail,
  type Leaderboard,
  type LeaderboardEntry,
} from "@/lib/api";
import { medalTierFor } from "@/lib/medal";
import { downloadPodiumPng } from "@/lib/podium-image";
import { useSession } from "@/lib/session";
import { ArrowLeft, Copy, Download, Loader2, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Classroom host screen. Shown on the projector so students physically present
 * can scan and join.
 *
 * The viewport is pinned: nothing here may scroll the document — every list
 * scrolls inside its own box. A projected screen with a stray scrollbar at the
 * bottom looks broken from the back row.
 */
export default function HostPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { teacher, loading: sessionLoading } = useSession();
  const examId = params.id;

  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [live, setLive] = useState<ExamLiveState | null>(null);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!sessionLoading && !teacher) router.replace("/login");
  }, [sessionLoading, teacher, router]);

  // One 4s tick drives everything. The exam itself is refetched so a reveal
  // fired from the teacher's laptop flips this screen over on its own — the
  // projector is never told to reload.
  useEffect(() => {
    if (!teacher) return;
    let active = true;
    const tick = () => {
      examApi.get(examId).then((e) => active && setExam(e)).catch(() => undefined);
      examApi.live(examId).then((s) => active && setLive(s)).catch(() => undefined);
      examApi.leaderboard(examId).then((b) => active && setBoard(b)).catch(() => undefined);
    };
    void tick();
    const poll = setInterval(tick, 4000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [teacher, examId]);

  if (sessionLoading || !teacher || !exam) {
    return (
      <div className="grid min-h-svh place-items-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }

  const url = joinUrl(exam.joinCode);
  const remaining = new Date(exam.endsAt).getTime() - now;
  const inProgress = live?.participants.filter((p) => p.status === "in_progress").length ?? 0;
  const total = live?.participants.length ?? 0;
  const isOpen = remaining > 0 && exam.status !== "closed";
  const revealed = !!exam.revealedAt || !!board?.revealedAt;

  async function copyCode() {
    if (!exam) return;
    try {
      await navigator.clipboard.writeText(exam.joinCode);
      toast.success("Code copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <div className="bg-background flex h-svh flex-col overflow-hidden p-6 lg:p-8">
      <header className="flex shrink-0 items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{exam.title}</h1>
          <p className="text-muted-foreground text-sm">
            {exam.batchName} · {exam.paper.length} questions · {exam.maxScore} marks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={revealed ? "success" : isOpen ? "secondary" : "destructive"}>
            {revealed
              ? "Answers released"
              : isOpen
                ? `Closes in ${formatCountdown(remaining)}`
                : "Exam closed"}
          </Badge>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/exams/${exam.id}`}>
              <ArrowLeft className="size-4" /> Back
            </Link>
          </Button>
        </div>
      </header>

      {revealed ? (
        <Standings board={board} exam={exam} />
      ) : (
        <div className="mt-6 grid min-h-0 flex-1 gap-6 lg:grid-cols-[auto_1fr]">
          <Card className="flex min-h-0 flex-col items-center gap-5 overflow-y-auto p-8">
            <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              Scan to join
            </p>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <QRCodeSVG value={url} size={260} level="M" marginSize={2} />
            </div>
            <div className="text-center">
              <p className="text-muted-foreground text-xs">Or enter the code</p>
              <div className="mt-1 flex items-center justify-center gap-2">
                <p className="font-mono text-4xl font-semibold tracking-[0.35em]">{exam.joinCode}</p>
                <Button variant="ghost" size="icon" onClick={() => void copyCode()} aria-label="Copy code">
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
            <p className="text-muted-foreground max-w-xs text-center text-xs break-all">{url}</p>
          </Card>

          <Card className="flex min-h-0 flex-col p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="size-4" />
                <h2 className="font-medium">Joined</h2>
              </div>
              <div className="text-muted-foreground flex gap-4 text-sm">
                <span>
                  <span className="text-foreground font-semibold tabular-nums">{total}</span> joined
                </span>
                <span>
                  <span className="text-foreground font-semibold tabular-nums">{inProgress}</span>{" "}
                  working
                </span>
              </div>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {total === 0 ? (
                <div className="text-muted-foreground flex h-full min-h-40 items-center justify-center text-sm">
                  Waiting for students to scan…
                </div>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {live?.participants.map((p) => (
                    <li
                      key={p.attemptId}
                      className="bg-card flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="text-muted-foreground font-mono text-xs">{p.rollNo}</p>
                      </div>
                      <Badge variant={p.status === "in_progress" ? "secondary" : "success"}>
                        {p.answeredCount}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/**
 * Post-reveal: the podium and the full board, side by side. The board scrolls
 * inside its own column so a class of 80 never pushes the page down.
 */
function Standings({ board, exam }: { board: Leaderboard | null; exam: ExamDetail }) {
  if (!board) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mt-6 grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(300px,0.85fr)_1fr]">
      <Podium entries={board.entries.slice(0, 3)} board={board} exam={exam} />

      <Card className="flex min-h-0 flex-col p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="size-4" />
            <h2 className="font-medium">Leaderboard</h2>
          </div>
          <p className="text-muted-foreground text-sm tabular-nums">
            <span className="text-foreground font-semibold">{board.appeared}</span> of{" "}
            {board.cohortSize} on the board
          </p>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          {board.entries.length === 0 ? (
            <div className="text-muted-foreground flex h-full min-h-40 items-center justify-center text-sm">
              Nobody has finished yet.
            </div>
          ) : (
            <ol>
              {board.entries.map((e) => {
                const tier = medalTierFor(e.rank);
                return (
                  <li
                    key={e.attemptId}
                    className="grid grid-cols-[2.75rem_1fr_auto] items-center gap-3 border-b py-2.5 last:border-b-0"
                  >
                    {tier ? (
                      <Medal tier={tier} rank={e.rank} size={28} className="justify-self-center" />
                    ) : (
                      <span className="stat-figure text-lg text-muted-foreground">{e.rank}</span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.name}</p>
                      <p className="text-muted-foreground font-mono text-xs">{e.rollNo}</p>
                    </div>
                    <span className="stat-figure text-lg tabular-nums">
                      {e.score}
                      <span className="text-muted-foreground text-sm">/{e.maxScore}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * Top three, first place in the middle on the tallest block.
 *
 * The group is centred in the card rather than docked to its floor, while the
 * blocks themselves stay bottom-aligned with each other — a podium floating in
 * the middle of the screen reads as a podium; one pushed against the bottom
 * edge reads as a footnote.
 *
 * The medal carries the rank, so the blocks are bare: printing "1" twice on
 * the same column is one time too many.
 */
function Podium({
  entries,
  board,
  exam,
}: {
  entries: LeaderboardEntry[];
  board: Leaderboard;
  exam: ExamDetail;
}) {
  // Render order: 2nd, 1st, 3rd — the winner reads as the centre of the screen.
  const order = [1, 0, 2];
  const blockHeight = ["h-44", "h-32", "h-24"];
  const [saving, setSaving] = useState(false);

  async function savePng() {
    setSaving(true);
    try {
      await downloadPodiumPng({
        examTitle: exam.title,
        batchName: exam.batchName,
        board,
      });
      toast.success("Podium image saved");
    } catch {
      toast.error("Could not save the image");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex min-h-0 flex-col p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Top three</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void savePng()}
          disabled={saving || entries.length === 0}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Save PNG
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-4">
        <div className="flex w-full items-end justify-center gap-3">
          {entries.length === 0 ? (
            <div className="text-muted-foreground w-full py-10 text-center text-sm">
              Waiting for the first finisher…
            </div>
          ) : (
            order.map((place) => {
              const entry = entries[place];
              if (!entry) return null;
              const tier = medalTierFor(place + 1);
              const first = place === 0;
              return (
                <div
                  key={entry.attemptId}
                  className="flex w-full max-w-[32%] flex-col items-center gap-2"
                >
                  {tier ? <Medal tier={tier} rank={place + 1} size={52} className="shrink-0" /> : null}
                  <div className="w-full min-w-0 text-center">
                    <p className="truncate text-sm font-medium">{entry.name}</p>
                    <p className="text-muted-foreground font-mono text-xs">{entry.rollNo}</p>
                    <p className="stat-figure mt-1 text-3xl tabular-nums">
                      {entry.score}
                      <span className="text-muted-foreground text-lg">/{entry.maxScore}</span>
                    </p>
                  </div>
                  <div
                    className={`w-full rounded-t-xl border ${blockHeight[place]} ${
                      first ? "border-primary/40 bg-primary/10" : "border-border bg-muted/70"
                    }`}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </Card>
  );
}
