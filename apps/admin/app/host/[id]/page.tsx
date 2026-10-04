"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { joinUrl, examApi, type ExamLiveState, type ExamDetail } from "@/lib/api";
import { useSession } from "@/lib/session";
import { ArrowLeft, Copy, Loader2, Users } from "lucide-react";
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
 * can scan and join. Polls the live roster while the window is open.
 */
export default function HostPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { teacher, loading: sessionLoading } = useSession();
  const examId = params.id;

  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [live, setLive] = useState<ExamLiveState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!sessionLoading && !teacher) router.replace("/login");
  }, [sessionLoading, teacher, router]);

  useEffect(() => {
    if (!teacher) return;
    examApi.get(examId).then(setExam).catch(() => undefined);
  }, [teacher, examId]);

  useEffect(() => {
    if (!teacher || !exam) return;
    let active = true;
    const tick = () => examApi.live(examId).then((s) => active && setLive(s)).catch(() => undefined);
    void tick();
    const poll = setInterval(tick, 4000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [teacher, exam, examId]);

  if (sessionLoading || !teacher) {
    return (
      <div className="grid min-h-svh place-items-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }

  if (!exam) {
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
    <div className="bg-background flex min-h-svh flex-col p-8">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{exam.title}</h1>
          <p className="text-muted-foreground text-sm">
            {exam.batchName} · {exam.paper.length} questions · {exam.maxScore} marks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isOpen ? "success" : "destructive"}>
            {isOpen ? `Closes in ${formatCountdown(remaining)}` : "Exam closed"}
          </Badge>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/exams/${exam.id}`}>
              <ArrowLeft className="size-4" /> Back
            </Link>
          </Button>
        </div>
      </header>

      <div className="mt-8 grid flex-1 gap-8 lg:grid-cols-[auto_1fr]">
        <Card className="flex flex-col items-center gap-5 p-8">
          <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Scan to join
          </p>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <QRCodeSVG value={url} size={300} level="M" marginSize={2} />
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

        <Card className="flex flex-col p-6">
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

          <div className="mt-4 flex-1 overflow-y-auto">
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
    </div>
  );
}
