"use client";

import type { Question, Topic } from "@kap-exam/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AiGenerateDialog } from "@/components/ai-generate-dialog";
import { EmptyState } from "@/components/empty-state";
import { NameDialog } from "@/components/name-dialog";
import { Pagination } from "@/components/pagination";
import { QuestionEditor } from "@/components/question-editor";
import { PageBody, PageHeader } from "@/components/page-header";
import { QUESTION_TYPE_LABELS } from "@/lib/question-form";
import { cn } from "@/lib/utils";
import { ChevronRight, ClipboardList, Loader2, MoreHorizontal, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, questionApi, topicApi } from "@/lib/api";
import { MathText } from "@kap-exam/ui";

type NameDialogState =
  | { mode: "root" }
  | { mode: "child"; parentId: string }
  | { mode: "rename"; topic: Topic }
  | null;

export default function QuestionsPage() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [search, setSearch] = useState("");
  /** The committed search term — debounced so typing does not hammer D1. */
  const [term, setTerm] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Question | undefined>(undefined);

  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [topicToDelete, setTopicToDelete] = useState<Topic | null>(null);
  const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const roots = useMemo(() => topics.filter((topic) => topic.parentId === null), [topics]);
  const childrenOf = useCallback(
    (parentId: string) => topics.filter((topic) => topic.parentId === parentId),
    [topics],
  );
  const selectedTopic = topics.find((topic) => topic.id === selectedId) ?? null;

  const loadTopics = useCallback(async () => {
    setLoadingTopics(true);
    try {
      const list = await topicApi.list();
      setTopics(list);
      setSelectedId(
        (current) => current ?? list.find((t) => t.parentId !== null)?.id ?? list[0]?.id ?? null,
      );
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not load topics");
    } finally {
      setLoadingTopics(false);
    }
  }, []);

  useEffect(() => {
    void loadTopics();
  }, [loadTopics]);

  useEffect(() => {
    const handle = setTimeout(() => setTerm(search), 250);
    return () => clearTimeout(handle);
  }, [search]);

  // A new topic or a new search starts back at the first page.
  useEffect(() => {
    setOffset(0);
  }, [selectedId, term]);

  /** Monotonic id so a slower, older page never overwrites a newer one. */
  const requestId = useRef(0);

  const loadQuestions = useCallback(
    async (
      scope: { id: string; isRoot: boolean },
      term: string,
      pageOffset: number,
      pageLimit: number,
    ) => {
      const id = ++requestId.current;
      setLoadingQuestions(true);
      try {
        const page = await questionApi.list({
          // A folder is a pool: picking a topic asks for its whole subtree,
          // not just the questions filed directly beneath it.
          topicId: scope.isRoot ? scope.id : undefined,
          subtopicId: scope.isRoot ? undefined : scope.id,
          search: term || undefined,
          offset: pageOffset,
          limit: pageLimit,
        });
        if (id !== requestId.current) return;
        setQuestions(page.items);
        setTotal(page.total);
      } catch (error) {
        if (id !== requestId.current) return;
        toast.error(error instanceof ApiError ? error.message : "Could not load questions");
      } finally {
        if (id === requestId.current) setLoadingQuestions(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedId) {
      setQuestions([]);
      setTotal(0);
      return;
    }
    void loadQuestions(
      { id: selectedId, isRoot: selectedTopic?.parentId === null },
      term,
      offset,
      limit,
    );
  }, [selectedId, selectedTopic, term, offset, limit, loadQuestions]);

  /** Refetch whatever is selected right now (after a save, a delete, …). */
  const reloadQuestions = useCallback(() => {
    if (!selectedId) return;
    void loadQuestions(
      { id: selectedId, isRoot: selectedTopic?.parentId === null },
      term,
      offset,
      limit,
    );
  }, [selectedId, selectedTopic, term, offset, limit, loadQuestions]);

  async function handleNameSubmit(name: string) {
    if (!nameDialog) return;
    try {
      if (nameDialog.mode === "root") {
        const topic = await topicApi.create({ name, parentId: null });
        setTopics((current) => [...current, topic]);
        setSelectedId(topic.id);
        toast.success("Topic created");
      } else if (nameDialog.mode === "child") {
        const topic = await topicApi.create({ name, parentId: nameDialog.parentId });
        setTopics((current) => [...current, topic]);
        setSelectedId(topic.id);
        toast.success("Subtopic created");
      } else {
        const updated = await topicApi.update(nameDialog.topic.id, { name });
        setTopics((current) => current.map((t) => (t.id === updated.id ? updated : t)));
        toast.success("Renamed");
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong");
    }
  }

  async function deleteTopic(topic: Topic) {
    try {
      await topicApi.remove(topic.id);
      setTopics((current) =>
        current.filter((t) => t.id !== topic.id && t.parentId !== topic.id),
      );
      if (selectedId === topic.id) setSelectedId(null);
      toast.success("Topic deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not delete");
    }
  }

  async function deleteQuestion(question: Question) {
    try {
      await questionApi.remove(question.id);
      setQuestions((current) => current.filter((item) => item.id !== question.id));
      setTotal((current) => Math.max(0, current - 1));
      // Deleting the last item on a page steps back rather than showing a blank one.
      if (questions.length <= 1 && offset > 0) setOffset(Math.max(0, offset - limit));
      toast.success("Question deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not delete");
    }
  }

  /** One click from the bank to an exam draft prefilled with this pool. */
  async function examFromHere(topic: Topic) {
    const isRoot = topic.parentId === null;
    let available = 0;
    try {
      const counts = await topicApi.counts();
      available = counts.subtree[topic.id] ?? 0;
    } catch {
      /* leave 0 — the exam page still works, it just won't show a pool size */
    }
    const draft = {
      key: Math.random().toString(36).slice(2, 10),
      kind: isRoot ? "topic" : "subtopic",
      ...(isRoot ? { topicId: topic.id } : { subtopicId: topic.id }),
      label: topic.name,
      available,
    };
    try {
      sessionStorage.setItem("kap_exam_prefill", JSON.stringify(draft));
    } catch {
      /* storage unavailable — the exam page just starts empty */
    }
    router.push("/exams/new");
  }

  return (
    <>
      <PageHeader
        title="Question bank"
        description="Questions live in topics and subtopics. Reuse them in any exam."
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Topics tree */}
        <aside className="bg-card/30 flex w-72 shrink-0 flex-col border-r">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-medium">Topics</p>
            <Button size="sm" variant="ghost" onClick={() => setNameDialog({ mode: "root" })}>
              <Plus className="size-4" /> New
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loadingTopics ? (
              <div className="text-muted-foreground flex items-center gap-2 px-2 py-4 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : roots.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-3 py-10 text-center">
                <p className="text-muted-foreground text-sm">
                  No topics yet. Start by naming a topic, e.g. “Algebra”.
                </p>
                <Button size="sm" onClick={() => setNameDialog({ mode: "root" })}>
                  <Plus className="size-4" /> Create a topic
                </Button>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {roots.map((root) => (
                  <li key={root.id}>
                    <TopicRow
                      topic={root}
                      active={selectedId === root.id}
                      onSelect={() => setSelectedId(root.id)}
                      onAddChild={() => setNameDialog({ mode: "child", parentId: root.id })}
                      onRename={() => setNameDialog({ mode: "rename", topic: root })}
                      onExamFromTopic={() => void examFromHere(root)}
                      onDelete={() => setTopicToDelete(root)}
                    />
                    <ul className="mt-0.5 space-y-0.5">
                      {childrenOf(root.id).map((child) => (
                        <li key={child.id}>
                          <TopicRow
                            topic={child}
                            child
                            active={selectedId === child.id}
                            onSelect={() => setSelectedId(child.id)}
                            onAddChild={() => setNameDialog({ mode: "child", parentId: child.id })}
                            onRename={() => setNameDialog({ mode: "rename", topic: child })}
                            onExamFromTopic={() => void examFromHere(child)}
                            onDelete={() => setTopicToDelete(child)}
                          />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Questions */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b px-6 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {selectedTopic ? selectedTopic.name : "Select a topic"}
              </p>
              <p className="text-muted-foreground text-xs">
                {questions.length} question{questions.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  className="h-9 w-44 pl-8"
                  disabled={!selectedId}
                />
              </div>
              <Button variant="outline" onClick={() => setAiOpen(true)}>
                <Sparkles className="size-4" /> Generate with AI
              </Button>
              <Button
                disabled={!selectedId}
                onClick={() => {
                  setEditing(undefined);
                  setEditorOpen(true);
                }}
              >
                <Plus className="size-4" /> New question
              </Button>
            </div>
          </div>

          <PageBody>
            {!selectedId ? (
              <EmptyState
                title="Pick a topic"
                description="Choose a topic or subtopic on the left to see its questions."
              />
            ) : loadingQuestions ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading questions…
              </div>
            ) : questions.length === 0 ? (
              <EmptyState
                title={search ? "No matches" : "Nothing here yet"}
                description={
                  search
                    ? "No questions match your search in this folder."
                    : "Add questions by hand, or let AI draft a set you can review."
                }
                action={
                  !search ? (
                    <>
                      <Button
                        onClick={() => {
                          setEditing(undefined);
                          setEditorOpen(true);
                        }}
                      >
                        <Plus className="size-4" /> Add a question
                      </Button>
                      <Button variant="outline" onClick={() => setAiOpen(true)}>
                        <Sparkles className="size-4" /> Generate with AI
                      </Button>
                    </>
                  ) : undefined
                }
              />
            ) : (
              <ul className="space-y-3">
                {questions.map((question) => (
                  <li key={question.id}>
                    <Card className="gap-0 py-4 transition-colors hover:border-primary/40">
                      <div className="flex items-start justify-between gap-4 px-5">
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{QUESTION_TYPE_LABELS[question.type]}</Badge>
                            <span className="text-muted-foreground text-xs">
                              {question.marks} mark{question.marks === 1 ? "" : "s"}
                              {question.negativeMarks > 0 ? ` · −${question.negativeMarks}` : ""}
                            </span>
                          </div>
                          <p className="line-clamp-2 text-sm">
                            <MathText>{question.prompt}</MathText>
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="shrink-0">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditing(question);
                                setEditorOpen(true);
                              }}
                            >
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setQuestionToDelete(question)}
                            >
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
            {!loadingQuestions && questions.length > 0 && (
              <Pagination
                total={total}
                limit={limit}
                offset={offset}
                noun="questions"
                className="mt-5"
                onChange={({ limit: nextLimit, offset: nextOffset }) => {
                  setLimit(nextLimit);
                  setOffset(nextOffset);
                }}
              />
            )}
          </PageBody>
        </div>
      </div>

      {selectedId && (
        <QuestionEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          subtopicId={selectedId}
          initial={editing}
          onSaved={(saved) =>
            setQuestions((current) =>
              current.some((item) => item.id === saved.id)
                ? current.map((item) => (item.id === saved.id ? saved : item))
                : [saved, ...current],
            )
          }
        />
      )}

      <NameDialog
        open={nameDialog !== null}
        onOpenChange={(open) => !open && setNameDialog(null)}
        title={
          nameDialog?.mode === "root"
            ? "New topic"
            : nameDialog?.mode === "child"
              ? "New subtopic"
              : "Rename"
        }
        description={
          nameDialog?.mode === "child"
            ? "Subtopics sit under a topic and hold the questions."
            : undefined
        }
        label={nameDialog?.mode === "child" ? "Subtopic name" : "Topic name"}
        placeholder="e.g. Linear equations"
        initialName={nameDialog?.mode === "rename" ? nameDialog.topic.name : ""}
        submitLabel={nameDialog?.mode === "rename" ? "Rename" : "Create"}
        onSubmit={handleNameSubmit}
      />

      <ConfirmDialog
        open={topicToDelete !== null}
        onOpenChange={(open) => !open && setTopicToDelete(null)}
        title={`Delete “${topicToDelete?.name ?? "this topic"}”?`}
        description="This removes the topic, its subtopics and every question inside them. Exams already given keep their own copy, so past report cards are safe."
        confirmLabel="Delete topic"
        onConfirm={async () => {
          if (topicToDelete) await deleteTopic(topicToDelete);
        }}
      />

      <ConfirmDialog
        open={questionToDelete !== null}
        onOpenChange={(open) => !open && setQuestionToDelete(null)}
        title="Delete this question?"
        description="It disappears from the bank. Exams already given keep their own copy."
        confirmLabel="Delete question"
        onConfirm={async () => {
          if (questionToDelete) await deleteQuestion(questionToDelete);
        }}
      />

      <AiGenerateDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        topics={topics}
        defaultSubtopicId={selectedId}
        onAdded={(targetId) => {
          // Refresh the bank so the new set is visible wherever it landed.
          void loadTopics();
          if (targetId !== selectedId) setSelectedId(targetId);
          else reloadQuestions();
        }}
      />
    </>
  );
}

function TopicRow({
  topic,
  child = false,
  active,
  onSelect,
  onAddChild,
  onRename,
  onExamFromTopic,
  onDelete,
}: {
  topic: Topic;
  child?: boolean;
  active: boolean;
  onSelect: () => void;
  onAddChild: () => void;
  onRename: () => void;
  onExamFromTopic: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-1">
      <button
        onClick={onSelect}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          child && "pl-4",
          active
            ? "bg-primary/10 text-primary font-medium"
            : "hover:bg-accent hover:text-accent-foreground",
        )}
      >
        {child && <ChevronRight className="size-3 shrink-0 opacity-50" />}
        <span className="truncate">{topic.name}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-1.5 transition-[opacity,background-color] md:opacity-0 md:group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label={`Options for ${topic.name}`}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onAddChild}>
            <Plus /> Add subtopic
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRename}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onExamFromTopic}>
            <ClipboardList /> Exam from this
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
