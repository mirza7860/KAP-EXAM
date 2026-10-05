"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { QUESTION_TYPE_LABELS } from "@/lib/question-form";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { questionApi, topicApi, type PaperSourceInput } from "@/lib/api";
import type { Question, Topic } from "@kap-exam/shared";
import { MathText } from "@kap-exam/ui";

export type SourceDraft = (
  | PaperSourceInput
  | { kind: "subtopic"; subtopicId: string; count?: number }
  | { kind: "topic"; topicId: string; count?: number }
) & {
  /** Local key for rendering; not sent to the server. */
  key: string;
  label: string;
  available: number;
  count?: number;
};

function newKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * The paper builder. A teacher picks a topic or subtopic and says how many
 * questions to take (all, or a random N). Or hand-picks specific questions.
 */
export function PaperBuilder({
  sources,
  onChange,
}: {
  sources: SourceDraft[];
  onChange: (sources: SourceDraft[]) => void;
}) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [counts, setCounts] = useState<{ bySubtopic: Record<string, number>; subtree: Record<string, number> }>({
    bySubtopic: {},
    subtree: {},
  });
  const [mode, setMode] = useState<"pool" | "manual">("pool");
  const [pickId, setPickId] = useState("");
  const [pickCount, setPickCount] = useState("");

  // manual picking
  const [manualSubtopic, setManualSubtopic] = useState("");
  const [manualQuestions, setManualQuestions] = useState<Question[]>([]);
  const [manualTotal, setManualTotal] = useState(0);
  const [manualSearch, setManualSearch] = useState("");
  const [manualSelected, setManualSelected] = useState<Set<string>>(new Set());

  // Whether the picker is busy is derived rather than toggled: it is true
  // exactly while the results for what is on screen have not settled. No
  // control has to remember to switch a flag on first, and a request that
  // comes back out of order leaves the spinner on until the one that counts
  // has landed.
  const manualKey =
    mode === "manual" && manualSubtopic ? `${manualSubtopic}|${manualSearch}` : null;
  const [manualSettled, setManualSettled] = useState<string | null>(null);
  const manualLoading = manualKey !== null && manualKey !== manualSettled;

  useEffect(() => {
    Promise.all([topicApi.list(), topicApi.counts()])
      .then(([topicList, countData]) => {
        setTopics(topicList);
        setCounts(countData);
        setPickId((current) => current || topicList[0]?.id || "");
        setManualSubtopic(
          (current) => current || topicList.find((t) => t.parentId !== null)?.id || "",
        );
      })
      .catch(() => toast.error("Could not load topics"));
  }, []);

  useEffect(() => {
    if (manualKey === null) return;
    questionApi
      .list({ subtopicId: manualSubtopic, search: manualSearch || undefined, limit: 100 })
      .then((page) => {
        setManualQuestions(page.items);
        setManualTotal(page.total);
      })
      .catch(() => toast.error("Could not load questions"))
      .finally(() => setManualSettled(manualKey));
  }, [manualKey, manualSubtopic, manualSearch]);

  const label = useCallback(
    (topic: Topic) => (topic.parentId ? `— ${topic.name}` : topic.name),
    [],
  );

  const addPool = () => {
    const topic = topics.find((t) => t.id === pickId);
    if (!topic) return;
    const available = counts.subtree[topic.id] ?? 0;
    if (available === 0) {
      toast.error("That has no questions yet");
      return;
    }
    const count = pickCount.trim() === "" ? undefined : Number(pickCount);
    if (count !== undefined && (Number.isNaN(count) || count < 1)) {
      toast.error("Enter a valid number");
      return;
    }
    if (count !== undefined && count > available) {
      toast.error(`Only ${available} questions available`);
      return;
    }
    onChange([
      ...sources,
      {
        key: newKey(),
        kind: topic.parentId ? "subtopic" : "topic",
        ...(topic.parentId ? { subtopicId: topic.id } : { topicId: topic.id }),
        count,
        label: topic.name,
        available,
      } as SourceDraft,
    ]);
    setPickCount("");
  };

  const addManual = () => {
    if (manualSelected.size === 0) {
      toast.error("Tick at least one question");
      return;
    }
    const chosen = manualQuestions.filter((q) => manualSelected.has(q.id));
    onChange([
      ...sources,
      {
        key: newKey(),
        kind: "questions",
        questionIds: chosen.map((q) => q.id),
        label: `${chosen.length} picked question${chosen.length === 1 ? "" : "s"}`,
        available: chosen.length,
      },
    ]);
    setManualSelected(new Set());
  };

  const updateCount = (key: string, value: string) => {
    onChange(
      sources.map((source) => {
        if (source.key !== key || source.kind === "questions") return source;
        const count = value.trim() === "" ? undefined : Number(value);
        return { ...source, count: Number.isNaN(count) ? undefined : count };
      }),
    );
  };

  const remove = (key: string) => onChange(sources.filter((source) => source.key !== key));

  const chosenTotal = useMemo(
    () =>
      sources.reduce((sum, source) => sum + (source.count ?? source.available), 0),
    [sources],
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === "pool" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("pool")}
        >
          Take a number
        </Button>
        <Button
          type="button"
          variant={mode === "manual" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("manual")}
        >
          Pick questions
        </Button>
      </div>

      {mode === "pool" ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label className="text-xs">Topic or subtopic</Label>
            <Select value={pickId} onValueChange={setPickId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {topics.map((topic) => (
                  <SelectItem key={topic.id} value={topic.id}>
                    {label(topic)} ({counts.subtree[topic.id] ?? 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28 space-y-1.5">
            <Label className="text-xs">How many</Label>
            <Input
              type="number"
              min="1"
              placeholder="all"
              value={pickCount}
              onChange={(e) => setPickCount(e.target.value)}
            />
          </div>
          <Button type="button" onClick={addPool}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex gap-2">
            <Select value={manualSubtopic} onValueChange={setManualSubtopic}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a subtopic" />
              </SelectTrigger>
              <SelectContent>
                {topics.map((topic) => (
                  <SelectItem key={topic.id} value={topic.id}>
                    {label(topic)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
                placeholder="Search"
                className="w-40 pl-8"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-md border">
            {manualLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : manualQuestions.length === 0 ? (
              <p className="text-muted-foreground p-3 text-sm">No questions here.</p>
            ) : (
              <ul className="divide-y">
                {manualQuestions.map((question) => (
                  <li key={question.id} className="flex items-start gap-3 p-2.5">
                    <Checkbox
                      className="mt-0.5"
                      checked={manualSelected.has(question.id)}
                      onCheckedChange={(value) =>
                        setManualSelected((current) => {
                          const next = new Set(current);
                          if (value) next.add(question.id);
                          else next.delete(question.id);
                          return next;
                        })
                      }
                    />
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm">
                        <MathText>{question.prompt}</MathText>
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {QUESTION_TYPE_LABELS[question.type]} · {question.marks}m
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {!manualLoading && manualTotal > manualQuestions.length && (
            <p className="text-muted-foreground text-xs">
              Showing {manualQuestions.length} of {manualTotal} — search to narrow it down.
            </p>
          )}
          <Button type="button" onClick={addManual} disabled={manualSelected.size === 0}>
            <Plus className="size-4" /> Add {manualSelected.size || ""} selected
          </Button>
        </div>
      )}

      {/* Chosen sources */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
          <span className="font-medium">Paper</span>
          <Badge variant="secondary">{chosenTotal} questions</Badge>
        </div>
        {sources.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">
            Nothing added yet. Pick a subtopic and a number above.
          </p>
        ) : (
          <ul className="divide-y">
            {sources.map((source) => (
              <li key={source.key} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{source.label}</p>
                  <p className="text-muted-foreground text-xs">
                    {source.available} available
                    {source.count !== undefined ? ` · taking ${source.count}` : " · taking all"}
                  </p>
                </div>
                {source.kind !== "questions" && (
                  <Input
                    type="number"
                    min="1"
                    placeholder="all"
                    className="w-20"
                    value={source.count ?? ""}
                    onChange={(e) => updateCount(source.key, e.target.value)}
                  />
                )}
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(source.key)}>
                  <Trash2 className="text-destructive size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        “All” takes every question in that topic/subtopic. A number takes that many at random, so two
        students can get different papers if you enable shuffling.
      </p>
    </div>
  );
}
