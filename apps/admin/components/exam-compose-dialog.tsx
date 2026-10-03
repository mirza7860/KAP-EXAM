"use client";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QUESTION_TYPE_LABELS } from "@/lib/question-form";
import { Loader2, PackagePlus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ApiError,
  examApi,
  moduleApi,
  questionApi,
  topicApi,
  type ModuleSummary,
  type PaperItem,
} from "@/lib/api";
import type { Question, Topic } from "@kap-exam/shared";

export function ExamComposeDialog({
  open,
  onOpenChange,
  examId,
  initialPaper,
  onComposed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: string;
  initialPaper?: PaperItem[];
  onComposed: (result: { paper: PaperItem[]; maxScore: number }) => void;
}) {
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [moduleId, setModuleId] = useState("");
  const [subtopicId, setSubtopicId] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Map<string, Question>>(new Map());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setPicked(new Map((initialPaper ?? []).map((item) => [item.questionId, item.question])));
    moduleApi
      .list()
      .then((list) => {
        setModules(list);
        setModuleId(list[0]?.id ?? "");
      })
      .catch(() => toast.error("Could not load modules"));
    topicApi
      .list()
      .then((list) => {
        setTopics(list);
        setSubtopicId(list.find((t) => t.parentId !== null)?.id ?? list[0]?.id ?? "");
      })
      .catch(() => toast.error("Could not load topics"));
  }, [open, initialPaper]);

  useEffect(() => {
    if (!open || !subtopicId) return;
    setLoading(true);
    questionApi
      .list({ subtopicId, search: search || undefined })
      .then(setQuestions)
      .catch(() => toast.error("Could not load questions"))
      .finally(() => setLoading(false));
  }, [open, subtopicId, search]);

  const totalMarks = useMemo(
    () => [...picked.values()].reduce((sum, question) => sum + question.marks, 0),
    [picked],
  );

  function toggle(question: Question, on: boolean) {
    setPicked((current) => {
      const next = new Map(current);
      if (on) next.set(question.id, question);
      else next.delete(question.id);
      return next;
    });
  }

  async function addModule() {
    if (!moduleId) return;
    try {
      const detail = await moduleApi.get(moduleId);
      setPicked((current) => {
        const next = new Map(current);
        for (const question of detail.questions) next.set(question.id, question);
        return next;
      });
      toast.success(`Added ${detail.questions.length} question${detail.questions.length === 1 ? "" : "s"} from the module`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not add the module");
    }
  }

  async function onSave() {
    setSaving(true);
    try {
      const result = await examApi.compose(examId, {
        moduleIds: [],
        questionIds: [...picked.keys()],
      });
      toast.success("Paper saved");
      onComposed({ paper: result.paper, maxScore: result.maxScore });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not save the paper");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add questions</DialogTitle>
          <DialogDescription>
            Drop in a whole module, or pick individual questions. The paper is frozen when you save.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <PackagePlus className="text-muted-foreground size-4" />
          <Select value={moduleId} onValueChange={setModuleId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Choose a module" />
            </SelectTrigger>
            <SelectContent>
              {modules.map((module) => (
                <SelectItem key={module.id} value={module.id}>
                  {module.name} · {module.questionCount} Q
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="secondary" size="sm" onClick={() => void addModule()}>
            Add module
          </Button>
        </div>

        <div className="flex gap-2">
          <Select value={subtopicId} onValueChange={setSubtopicId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a subtopic" />
            </SelectTrigger>
            <SelectContent>
              {topics.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>
                  {topic.parentId ? `— ${topic.name}` : topic.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-40 pl-8"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {loading ? (
              <div className="text-muted-foreground flex items-center gap-2 p-4 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : questions.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">No questions in this subtopic.</p>
            ) : (
              <ul className="divide-y">
                {questions.map((question) => (
                  <li key={question.id} className="flex items-start gap-3 p-3">
                    <Checkbox
                      className="mt-0.5"
                      checked={picked.has(question.id)}
                      onCheckedChange={(value) => toggle(question, Boolean(value))}
                    />
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm">{question.prompt}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {QUESTION_TYPE_LABELS[question.type]} · {question.marks} mark
                        {question.marks === 1 ? "" : "s"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex max-h-72 flex-col rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
              <span className="font-medium">Selected ({picked.size})</span>
              <Badge variant="secondary">{totalMarks} marks</Badge>
            </div>
            <ul className="flex-1 divide-y overflow-y-auto">
              {picked.size === 0 ? (
                <li className="text-muted-foreground p-3 text-sm">Nothing selected yet.</li>
              ) : (
                [...picked.values()].map((question) => (
                  <li key={question.id} className="flex items-start gap-2 p-3">
                    <span className="line-clamp-2 flex-1 text-sm">{question.prompt}</span>
                    <button
                      type="button"
                      onClick={() => toggle(question, false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void onSave()} disabled={saving || picked.size === 0}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save paper ({picked.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
