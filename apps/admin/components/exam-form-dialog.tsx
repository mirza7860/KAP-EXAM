"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiError, examApi, type BatchSummary, type ExamSummary } from "@/lib/api";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Format a Date for an <input type="datetime-local"> value (local time). */
function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function defaults() {
  const start = new Date();
  start.setMinutes(start.getMinutes() + 5, 0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

export function ExamFormDialog({
  open,
  onOpenChange,
  batches,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batches: BatchSummary[];
  onCreated: (exam: ExamSummary) => void;
}) {
  const [batchId, setBatchId] = useState("");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [duration, setDuration] = useState("30");
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d = defaults();
    setStart(d.start);
    setEnd(d.end);
    setTitle("");
    setDuration("30");
    setShuffleQuestions(false);
    setShuffleOptions(false);
    setBatchId((current) => current || batches[0]?.id || "");
  }, [open, batches]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
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
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      toast.error("Check the start and end times");
      return;
    }
    if (endsAt <= startsAt) {
      toast.error("The end time must be after the start time");
      return;
    }
    if (!Number.isFinite(minutes) || minutes < 1) {
      toast.error("Duration must be at least 1 minute");
      return;
    }
    if (minutes > (endsAt.getTime() - startsAt.getTime()) / 60_000 + 1) {
      toast.error("Duration cannot exceed the exam window");
      return;
    }

    setPending(true);
    try {
      const created = await examApi.create({
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
      toast.success("Exam created — now add questions");
      onCreated(created);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not create the exam");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New exam</DialogTitle>
          <DialogDescription>
            Set the window and duration now; pick the questions next.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Batch</Label>
            <Select value={batchId} onValueChange={setBatchId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a batch" />
              </SelectTrigger>
              <SelectContent>
                {batches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id}>
                    {batch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="exam-title">Title</Label>
            <Input
              id="exam-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly test — linear equations"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="exam-start">Opens</Label>
              <Input
                id="exam-start"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exam-end">Closes (hard)</Label>
              <Input
                id="exam-end"
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="exam-duration">Minutes per student</Label>
            <Input
              id="exam-duration"
              type="number"
              min="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Everyone must finish by the close time, so a late joiner gets less time.
            </p>
          </div>

          <div className="flex flex-wrap gap-5">
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

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || batches.length === 0}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Create exam
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
