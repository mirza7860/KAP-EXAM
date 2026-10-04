"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageBody, PageHeader } from "@/components/page-header";
import { PaperBuilder, type SourceDraft } from "@/components/paper-builder";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError, batchApi, examApi, type BatchSummary, type PaperSourceInput } from "@/lib/api";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function stripSource(source: SourceDraft): PaperSourceInput {
  if (source.kind === "questions") return { kind: "questions", questionIds: source.questionIds };
  if (source.kind === "subtopic")
    return { kind: "subtopic", subtopicId: source.subtopicId, count: source.count };
  return { kind: "topic", topicId: source.topicId, count: source.count };
}

export default function NewExamPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [batchId, setBatchId] = useState("");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [duration, setDuration] = useState("30");
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [sources, setSources] = useState<SourceDraft[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const s = new Date();
    s.setMinutes(s.getMinutes() + 5, 0, 0);
    setStart(toLocalInput(s));
    setEnd(toLocalInput(new Date(s.getTime() + 60 * 60_000)));

    batchApi
      .list()
      .then((list) => {
        setBatches(list);
        setBatchId((current) => current || list[0]?.id || "");
      })
      .catch(() => toast.error("Could not load batches"));

    // A prefill handed over from the question bank ("Create exam from this").
    try {
      const raw = sessionStorage.getItem("kap_exam_prefill");
      if (raw) {
        const draft = JSON.parse(raw) as SourceDraft;
        setSources([draft]);
        sessionStorage.removeItem("kap_exam_prefill");
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function onSubmit() {
    if (!batchId) {
      toast.error("Choose a batch");
      return;
    }
    if (!title.trim()) {
      toast.error("Give the exam a title");
      return;
    }
    const startsAt = new Date(start);
    const endsAt = new Date(end);
    const minutes = Number(duration);
    if (endsAt <= startsAt) {
      toast.error("The end time must be after the start time");
      return;
    }
    if (!Number.isFinite(minutes) || minutes < 1) {
      toast.error("Duration must be at least a minute");
      return;
    }
    if (sources.length === 0) {
      toast.error("Add at least one set of questions");
      return;
    }

    setCreating(true);
    try {
      const exam = await examApi.create({
        batchId,
        title: title.trim(),
        schedule: {
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          durationMinutes: minutes,
        },
        shuffleQuestions,
        shuffleOptions,
      });
      await examApi.compose(exam.id, { sources: sources.map(stripSource) });
      toast.success("Exam ready — review and publish");
      router.push(`/exams/${exam.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not create the exam");
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Create exam"
        description="Details and questions in one pass."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/exams">
              <ArrowLeft className="size-4" /> All exams
            </Link>
          </Button>
        }
      />
      <PageBody>
        {batches.length === 0 ? (
          <div className="border-border flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <p className="text-muted-foreground text-sm">
              You need a batch first — every exam belongs to a batch.
            </p>
            <Button asChild>
              <Link href="/batches">Go to batches</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Details</CardTitle>
                <CardDescription>Who sits it, and when.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Batch</Label>
                  <Select value={batchId} onValueChange={setBatchId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a batch" />
                    </SelectTrigger>
                    <SelectContent>
                      {batches.map((batch) => (
                        <SelectItem key={batch.id} value={batch.id}>
                          {batch.name} · {batch.studentCount}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Weekly test — algebra"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="start">Opens</Label>
                    <Input
                      id="start"
                      type="datetime-local"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end">Closes</Label>
                    <Input
                      id="end"
                      type="datetime-local"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">Minutes per student</Label>
                  <Input
                    id="duration"
                    type="number"
                    min="1"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={shuffleQuestions}
                      onCheckedChange={(v) => setShuffleQuestions(Boolean(v))}
                    />
                    Shuffle questions
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={shuffleOptions}
                      onCheckedChange={(v) => setShuffleOptions(Boolean(v))}
                    />
                    Shuffle options
                  </label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Questions</CardTitle>
                <CardDescription>
                  Take a random set from a subtopic, or hand-pick. Add more than one source to mix.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <PaperBuilder sources={sources} onChange={setSources} />
                <Button className="w-full" onClick={() => void onSubmit()} disabled={creating}>
                  {creating && <Loader2 className="size-4 animate-spin" />}
                  Create exam
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </PageBody>
    </>
  );
}
