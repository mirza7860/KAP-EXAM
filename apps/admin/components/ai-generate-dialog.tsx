"use client";

import type { QuestionInput, QuestionType, Topic } from "@kap-exam/shared";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { QUESTION_TYPE_LABELS } from "@/lib/question-form";
import { Loader2, Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiError, getToken, questionApi, topicApi } from "@/lib/api";

const ALL_TYPES: QuestionType[] = ["mcq_single", "mcq_multi", "true_false", "numeric"];

interface Draft extends QuestionInput {
  /** Local key for rendering. */
  key: string;
}

function toDraft(input: QuestionInput, index: number): Draft {
  return { ...input, key: `${Date.now()}-${index}` };
}

/**
 * AI question-set generation. Describe what you want, review every draft,
 * then add the approved set to a subtopic in one go. Nothing is saved until
 * you approve — generation only produces drafts.
 */
export function AiGenerateDialog({
  open,
  onOpenChange,
  topics,
  defaultSubtopicId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topics: Topic[];
  defaultSubtopicId?: string | null;
  onAdded: (subtopicId: string, count: number) => void;
}) {
  const [subtopicId, setSubtopicId] = useState("");
  const [newMode, setNewMode] = useState(false);
  const [newTopicId, setNewTopicId] = useState("");
  const [newName, setNewName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(10);
  const [types, setTypes] = useState<QuestionType[]>(ALL_TYPES);
  const [level, setLevel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const subtopics = useMemo(() => topics.filter((t) => t.parentId !== null), [topics]);
  const rootTopics = useMemo(() => topics.filter((t) => t.parentId === null), [topics]);

  useEffect(() => {
    if (!open) return;
    setSubtopicId(defaultSubtopicId ?? subtopics[0]?.id ?? "");
    setNewMode(false);
    setNewTopicId(rootTopics[0]?.id ?? "");
    setNewName("");
    setPrompt("");
    setCount(10);
    setTypes(ALL_TYPES);
    setLevel("");
    setDrafts([]);
    setWarnings([]);
    setSavedCount(0);
  }, [open, defaultSubtopicId, subtopics, rootTopics]);

  function toggleType(type: QuestionType, on: boolean) {
    setTypes((current) => {
      if (on) return [...current, type];
      const next = current.filter((t) => t !== type);
      return next.length === 0 ? current : next;
    });
  }

  async function onGenerate(event: FormEvent) {
    event.preventDefault();
    if (prompt.trim().length < 10) {
      toast.error("Describe what you want in a line or two");
      return;
    }

    // Resolve the target subtopic (possibly creating it first).
    let targetId = subtopicId;
    if (newMode) {
      if (!newTopicId || !newName.trim()) {
        toast.error("Pick a topic and name the new subtopic");
        return;
      }
      setGenerating(true);
      try {
        const created = await topicApi.create({ name: newName.trim(), parentId: newTopicId });
        targetId = created.id;
        setNewMode(false);
        setSubtopicId(targetId);
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : "Could not create subtopic");
        setGenerating(false);
        return;
      }
    }
    if (!targetId) {
      toast.error("Choose where the questions should go");
      setGenerating(false);
      return;
    }

    setGenerating(true);
    setDrafts([]);
    setWarnings([]);
    try {
      const token = getToken();
      const response = await fetch("/api/ai/generate-questions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          subtopicId: targetId,
          prompt: prompt.trim(),
          count,
          types,
          level: level.trim() || null,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { drafts: QuestionInput[]; warnings: string[] };
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(body?.error?.message ?? "Generation failed");
      const received = body?.data?.drafts ?? [];
      setDrafts(received.map(toDraft));
      setWarnings(body?.data?.warnings ?? []);
      if (received.length > 0) toast.success(`Review ${received.length} draft${received.length === 1 ? "" : "s"} below`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function patchDraft(key: string, patch: Partial<QuestionInput>) {
    setDrafts((current) => current.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  async function onApprove() {
    if (drafts.length === 0 || !subtopicId) return;
    setSaving(true);
    setSavedCount(0);
    let ok = 0;
    let failed = 0;
    for (const draft of drafts) {
      const { key: _key, ...input } = draft;
      void _key;
      try {
        await questionApi.create({ ...input, subtopicId });
        ok++;
      } catch {
        failed++;
      }
      setSavedCount(ok + failed);
    }
    setSaving(false);
    if (failed > 0) toast.error(`${failed} question${failed === 1 ? "" : "s"} could not be saved`);
    else toast.success(`Added ${ok} questions`);
    onAdded(subtopicId, ok);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> Generate questions with AI
          </DialogTitle>
          <DialogDescription>
            Describe the set you want. Review every draft — nothing is saved until you approve it.
          </DialogDescription>
        </DialogHeader>

        {drafts.length === 0 ? (
          <form onSubmit={onGenerate} className="space-y-4">
            <div className="space-y-2">
              <Label>Put them in</Label>
              {newMode ? (
                <div className="flex gap-2">
                  <Select value={newTopicId} onValueChange={setNewTopicId}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Topic" />
                    </SelectTrigger>
                    <SelectContent>
                      {rootTopics.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="New subtopic name"
                    className="flex-1"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setNewMode(false)}>
                    Existing
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select value={subtopicId} onValueChange={setSubtopicId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a subtopic" />
                    </SelectTrigger>
                    <SelectContent>
                      {subtopics.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="sm" onClick={() => setNewMode(true)}>
                    <Plus className="size-4" /> New
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-prompt">What should the set cover?</Label>
              <Textarea
                id="ai-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. 10 questions on quadratic word problems for Class 10 — 5 easy, 5 board-exam level"
                className="min-h-20"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>How many (default 10)</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setCount((c) => Math.max(1, c - 1))}
                  >
                    <Minus className="size-4" />
                  </Button>
                  <span className="w-8 text-center font-semibold tabular-nums">{count}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setCount((c) => Math.min(20, c + 1))}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-level">Level (optional)</Label>
                <Input
                  id="ai-level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  placeholder="e.g. Class 10, board difficulty"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Question types</Label>
              <div className="flex flex-wrap gap-4">
                {ALL_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={types.includes(t)} onCheckedChange={(v) => toggleType(t, Boolean(v))} />
                    {QUESTION_TYPE_LABELS[t].split("—")[0]?.trim() ?? t}
                  </label>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={generating}>
                {generating && <Loader2 className="size-4 animate-spin" />}
                {generating ? "Writing questions…" : "Generate"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-3">
            {warnings.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                {warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}
            <p className="text-muted-foreground text-sm">
              {drafts.length} draft{drafts.length === 1 ? "" : "s"} — tap a question to edit it, or remove
              the ones you don&rsquo;t want.
            </p>
            <ul className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
              {drafts.map((draft, i) => (
                <li key={draft.key} className="rounded-lg border p-3">
                  <ReviewDraft
                    draft={draft}
                    index={i}
                    onPatch={(patch) => patchDraft(draft.key, patch)}
                    onRemove={() => setDrafts((cur) => cur.filter((d) => d.key !== draft.key))}
                  />
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDrafts([])}>
                Start over
              </Button>
              <Button onClick={() => void onApprove()} disabled={saving || drafts.length === 0}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {saving ? `Saving ${savedCount}/${drafts.length}…` : `Add ${drafts.length} questions`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewDraft({
  draft,
  index,
  onPatch,
  onRemove,
}: {
  draft: Draft;
  index: number;
  onPatch: (patch: Partial<QuestionInput>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isChoice = draft.type === "mcq_single" || draft.type === "mcq_multi";

  function toggleCorrect(optionId: string) {
    if (draft.type === "mcq_single") {
      onPatch({ correctOptionIds: [optionId] });
      return;
    }
    const set = new Set(draft.correctOptionIds);
    if (set.has(optionId)) set.delete(optionId);
    else set.add(optionId);
    onPatch({ correctOptionIds: [...set] });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left">
          <span className="text-muted-foreground mr-2 text-xs tabular-nums">{index + 1}.</span>
          <span className="text-sm">{draft.prompt}</span>
        </button>
        <Badge variant="secondary" className="shrink-0">
          {draft.type === "mcq_single" ? "MCQ" : draft.type === "mcq_multi" ? "Multi" : draft.type === "true_false" ? "T/F" : "Num"}
        </Badge>
        <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={onRemove}>
          <Trash2 className="text-destructive size-4" />
        </Button>
      </div>

      {open && (
        <div className="space-y-3 border-t pt-3">
          <Textarea
            value={draft.prompt}
            onChange={(e) => onPatch({ prompt: e.target.value })}
            className="min-h-16 text-sm"
          />
          {isChoice && (
            <div className="space-y-1.5">
              {draft.options.map((option, oi) => (
                <div key={option.id} className="flex items-center gap-2">
                  <input
                    type={draft.type === "mcq_single" ? "radio" : "checkbox"}
                    name={`ai-correct-${draft.key}`}
                    checked={draft.correctOptionIds.includes(option.id)}
                    onChange={() => toggleCorrect(option.id)}
                    className="accent-primary size-4"
                  />
                  <Input
                    value={option.text}
                    onChange={(e) =>
                      onPatch({
                        options: draft.options.map((o) =>
                          o.id === option.id ? { ...o, text: e.target.value } : o,
                        ),
                      })
                    }
                    placeholder={`Option ${oi + 1}`}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          )}
          {draft.type === "true_false" && (
            <div className="flex gap-2">
              {(["true", "false"] as const).map((v) => (
                <Button
                  key={v}
                  type="button"
                  size="sm"
                  variant={draft.correctOptionIds[0] === v ? "default" : "outline"}
                  onClick={() => onPatch({ correctOptionIds: [v] })}
                >
                  {v === "true" ? "True" : "False"}
                </Button>
              ))}
            </div>
          )}
          {draft.type === "numeric" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Answer</Label>
                <Input
                  type="number"
                  step="any"
                  value={draft.correctNumber ?? ""}
                  onChange={(e) => onPatch({ correctNumber: Number(e.target.value) })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Marks</Label>
                <Input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={draft.marks}
                  onChange={(e) => onPatch({ marks: Number(e.target.value) || 1 })}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
