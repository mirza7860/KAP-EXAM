"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader, SectionHeading } from "@/components/page-header";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Library,
  Plus,
  Radio,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ApiError, overviewApi, type Overview } from "@/lib/api";

function countdown(target: string, now: number): string {
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return "closing";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs} hr`;
  return `in ${Math.round(hrs / 24)} d`;
}

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Captured when the data lands rather than read during render — a countdown
  // that calls Date.now() in render is impure and repaints unpredictably.
  const [now, setNow] = useState(0);

  // The effect only ever settles the request: every state commit happens in a
  // promise callback, so painting the page never triggers a second render.
  const load = useCallback(
    () =>
      overviewApi
        .get()
        .then((next) => {
          setData(next);
          setNow(Date.now());
          setError(null);
        })
        .catch((e) => {
          setError(e instanceof ApiError ? e.message : "Could not load your workspace");
        })
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Re-arming the skeleton is the caller's job — that is what an event
  // handler is for.
  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your question bank, batches and exams at a glance."
        actions={
          <Button asChild>
            <Link href="/exams/new">
              <Plus className="size-4" /> New exam
            </Link>
          </Button>
        }
      />
      <PageBody>
        {loading ? (
          <DashboardSkeleton />
        ) : error || !data ? (
          <div className="border-border/80 flex flex-col items-center gap-3 rounded-2xl border border-dashed py-20 text-center">
            <p className="text-muted-foreground text-sm">{error ?? "Something went wrong"}</p>
            <Button variant="outline" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="enter-rise space-y-12">
            {data.focus.length > 0 && (
              <section>
                <SectionHeading>Happening now</SectionHeading>
                <div className="stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {data.focus.map((exam) => (
                    <div
                      key={exam.id}
                      className={cn(
                        "relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border p-5",
                        exam.live
                          ? "border-primary/35 bg-primary/[0.04]"
                          : "bg-card border-border/80",
                      )}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          {exam.live ? (
                            <Badge variant="success" className="gap-1">
                              <Radio className="size-3" /> Live
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <CalendarClock className="size-3" /> Next
                            </Badge>
                          )}
                          <span className="text-muted-foreground text-xs">{exam.batchName}</span>
                        </div>
                        <p className="display truncate text-lg font-semibold">{exam.title}</p>
                        <p className="text-muted-foreground text-sm">
                          {exam.live
                            ? `Closes ${countdown(exam.endsAt, now)}`
                            : `Opens ${countdown(exam.startsAt, now)}`}
                          {" · "}
                          {exam.studentCount} student{exam.studentCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Button asChild size="sm" className="w-fit" variant={exam.live ? "default" : "outline"}>
                        <Link href={exam.live ? `/host/${exam.id}` : `/exams/${exam.id}`}>
                          {exam.live ? "Open host screen" : "Open exam"}
                          <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionHeading>Your workspace</SectionHeading>
              <div className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-2xl border sm:grid-cols-4">
                <Stat figure={data.counts.questions} label="Questions" hint="in the bank" href="/questions" />
                <Stat figure={data.counts.topics} label="Topics" hint="and subtopics" href="/questions" />
                <Stat figure={data.counts.batches} label="Batches" hint="cohorts" href="/batches" />
                <Stat figure={data.counts.students} label="Students" hint="across batches" href="/reports" />
              </div>
              <p className="text-muted-foreground mt-3 text-xs">
                {data.exams.liveNow} live now · {data.exams.upcoming} upcoming ·{" "}
                {data.exams.draft} draft{data.exams.draft === 1 ? "" : "s"} ·{" "}
                {data.exams.closed} closed
              </p>
            </section>

            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
              <section className="min-w-0">
                <SectionHeading
                  action={
                    <Link
                      href="/exams"
                      className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                    >
                      All exams
                    </Link>
                  }
                >
                  Recent exams
                </SectionHeading>
                {data.recentExams.length === 0 ? (
                  <p className="text-muted-foreground rounded-xl border border-dashed border-border/80 px-5 py-10 text-center text-sm">
                    No exams yet. Create one and share the QR in class.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/70">
                    {data.recentExams.map((exam) => (
                      <li key={exam.id}>
                        <Link
                          href={`/exams/${exam.id}`}
                          className="group hover:bg-muted/40 -mx-3 flex items-center justify-between gap-4 rounded-xl px-3 py-3 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{exam.title}</p>
                            <p className="text-muted-foreground truncate text-xs">
                              {exam.batchName} · {exam.questionCount} questions
                            </p>
                          </div>
                          <Badge
                            variant={
                              exam.status === "published"
                                ? "success"
                                : exam.status === "closed"
                                  ? "outline"
                                  : "secondary"
                            }
                          >
                            {exam.status}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <SectionHeading>Start something</SectionHeading>
                <div className="space-y-2">
                  <QuickAction href="/exams/new" icon={<ClipboardList className="size-4" />} label="Create an exam" hint="Pick a topic, take 10" />
                  <QuickAction href="/questions" icon={<Sparkles className="size-4" />} label="Generate questions" hint="With AI, then review" />
                  <QuickAction href="/questions" icon={<Library className="size-4" />} label="Open the bank" hint="Topics and subtopics" />
                  <QuickAction href="/batches" icon={<Users className="size-4" />} label="Manage a batch" hint="Roster and students" />
                </div>
              </section>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}

function Stat({
  figure,
  label,
  hint,
  href,
}: {
  figure: number;
  label: string;
  hint: string;
  href: string;
}) {
  return (
    <Link href={href} className="bg-card hover:bg-muted/40 group p-5 transition-colors">
      <p className="stat-figure text-3xl font-semibold">{figure}</p>
      <p className="eyebrow mt-2.5">{label}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
    </Link>
  );
}

function QuickAction({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="hover:border-primary/30 hover:bg-muted/40 group flex items-center gap-3 rounded-xl border border-border/80 px-3.5 py-3 transition-colors"
    >
      <span className="bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary grid size-9 shrink-0 place-items-center rounded-lg transition-colors">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="text-muted-foreground block text-xs">{hint}</span>
      </span>
      <ArrowRight className="text-muted-foreground/50 group-hover:text-foreground ml-auto size-4 shrink-0 transition-colors" />
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-12">
      <div>
        <Skeleton className="h-3 w-28" />
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
      <div>
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-28 rounded-2xl" />
      </div>
    </div>
  );
}
