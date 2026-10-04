"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { PageBody, PageHeader } from "@/components/page-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NameDialog } from "@/components/name-dialog";
import { QUESTION_TYPE_LABELS } from "@/lib/question-form";
import { ArrowLeft, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ApiError,
  moduleApi,
  questionApi,
  topicApi,
  type ModuleDetail,
} from "@/lib/api";
import type { Question, Topic } from "@kap-exam/shared";

export default function ModuleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const moduleId = params.id;

  const [module, setModule] = useState<ModuleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setModule(await moduleApi.get(moduleId));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not load the module");
    } finally {
      setLoading(false);
    }
  }, [moduleId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeQuestion(question: Question) {
    if (!module) return;
    try {
      await moduleApi.removeQuestion(module.id, question.id);
      setModule({
        ...module,
        questions: module.questions.filter((item) => item.id !== question.id),
        questionCount: Math.max(0, module.questionCount - 1),
      });
      toast.success("Removed from module");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not remove the question");
    }
  }

  async function rename(name: string) {
    if (!module) return;
    try {
      await moduleApi.update(module.id, { name });
      setModule({ ...module, name });
      toast.success("Renamed");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not rename");
    }
  }

  async function removeModule() {
    if (!module) return;
    try {
      await moduleApi.remove(module.id);
      toast.success("Module deleted");
      router.push("/modules");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not delete");
    }
  }

  return (
    <>
      <PageHeader
        title={module?.name ?? "Module"}
        description={module?.description || undefined}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/modules">
                <ArrowLeft className="size-4" /> All modules
              </Link>
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)} disabled={!module}>
              <Plus className="size-4" /> Add questions
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-9" disabled={!module}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setRenaming(true)}>
                  <Pencil /> Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                  <Trash2 /> Delete module
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />
      <PageBody>
        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : !module ? (
          <p className="text-muted-foreground text-sm">Module not found.</p>
        ) : module.questions.length === 0 ? (
          <div className="border-border flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <p className="text-muted-foreground text-sm">This module has no questions yet.</p>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add questions
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {module.questions.map((question, index) => (
              <li key={question.id}>
                <Card className="gap-3 py-4">
                  <div className="flex items-start justify-between gap-4 px-5">
                    <div className="flex min-w-0 gap-3">
                      <span className="text-muted-foreground pt-0.5 text-sm tabular-nums">
                        {index + 1}.
                      </span>
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{QUESTION_TYPE_LABELS[question.type]}</Badge>
                          <span className="text-muted-foreground text-xs">
                            {question.marks} mark{question.marks === 1 ? "" : "s"}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-sm">{question.prompt}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => void removeQuestion(question)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </PageBody>

      {module && (
        <>
          <AddQuestionsDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            moduleId={module.id}
            existingIds={module.questions.map((q) => q.id)}
            onAdded={() => void load()}
          />
          <NameDialog
            open={renaming}
            onOpenChange={setRenaming}
            title="Rename module"
            label="Module name"
            initialName={module.name}
            submitLabel="Rename"
            onSubmit={rename}
          />
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={`Delete “${module.name}”?`}
            description="The module is removed. The questions themselves stay in the question bank."
            confirmLabel="Delete module"
            onConfirm={removeModule}
          />
        </>
      )}
    </>
  );
}

function AddQuestionsDialog({
  open,
  onOpenChange,
  moduleId,
  existingIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleId: string;
  existingIds: string[];
  onAdded: () => void;
}) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [subtopicId, setSubtopicId] = useState<string>("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setSearch("");
    topicApi
      .list()
      .then((list) => {
        setTopics(list);
        setSubtopicId((current) => current || list.find((t) => t.parentId !== null)?.id || list[0]?.id || "");
      })
      .catch(() => toast.error("Could not load topics"));
  }, [open]);

  useEffect(() => {
    if (!open || !subtopicId) return;
    setLoading(true);
    questionApi
      .list({ subtopicId, search: search || undefined })
      .then(setQuestions)
      .catch(() => toast.error("Could not load questions"))
      .finally(() => setLoading(false));
  }, [open, subtopicId, search]);

  const existing = useMemo(() => new Set(existingIds), [existingIds]);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function onAdd() {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      await moduleApi.addQuestions(moduleId, [...selected]);
      toast.success(`Added ${selected.size} question${selected.size === 1 ? "" : "s"}`);
      onAdded();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not add questions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add questions</DialogTitle>
          <DialogDescription>Pick a subtopic, then tick the questions to add.</DialogDescription>
        </DialogHeader>

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

        <div className="max-h-80 overflow-y-auto rounded-md border">
          {loading ? (
            <div className="text-muted-foreground flex items-center gap-2 p-4 text-sm">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : questions.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">No questions in this subtopic.</p>
          ) : (
            <ul className="divide-y">
              {questions.map((question) => {
                const already = existing.has(question.id);
                return (
                  <li key={question.id} className="flex items-start gap-3 p-3">
                    <Checkbox
                      className="mt-0.5"
                      checked={already || selected.has(question.id)}
                      disabled={already}
                      onCheckedChange={(value) => toggle(question.id, Boolean(value))}
                    />
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm">{question.prompt}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {QUESTION_TYPE_LABELS[question.type]}
                        {already ? " · already in module" : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void onAdd()} disabled={saving || selected.size === 0}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Add {selected.size > 0 ? selected.size : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
