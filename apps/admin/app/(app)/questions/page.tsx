"use client";

import type { Question, Topic } from "@kap-exam/shared";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from "@kap-exam/ui";
import {
  ChevronRight,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { QuestionEditor } from "@/components/question-editor";
import { PageBody, PageHeader } from "@/components/page-header";
import { QUESTION_TYPE_LABELS } from "@/lib/question-form";
import { ApiError, questionApi, topicApi } from "@/lib/api";

export default function QuestionsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [search, setSearch] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Question | undefined>(undefined);

  const [newTopic, setNewTopic] = useState("");
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null);
  const [newChild, setNewChild] = useState("");
  const [pendingArchive, setPendingArchive] = useState<Question | null>(null);

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
      setSelectedId((current) => current ?? list.find((t) => t.parentId !== null)?.id ?? list[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not load topics");
    } finally {
      setLoadingTopics(false);
    }
  }, []);

  useEffect(() => {
    void loadTopics();
  }, [loadTopics]);

  const loadQuestions = useCallback(async (subtopicId: string, term: string) => {
    setLoadingQuestions(true);
    try {
      setQuestions(await questionApi.list({ subtopicId, search: term || undefined }));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not load questions");
    } finally {
      setLoadingQuestions(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setQuestions([]);
      return;
    }
    void loadQuestions(selectedId, search);
  }, [selectedId, search, loadQuestions]);

  async function createTopic(parentId: string | null, name: string) {
    if (!name.trim()) return;
    try {
      const topic = await topicApi.create({ name: name.trim(), parentId });
      setTopics((current) => [...current, topic]);
      if (parentId === null) setNewTopic("");
      else {
        setNewChild("");
        setAddingChildOf(null);
        setSelectedId(topic.id);
      }
      toast.success(parentId ? "Subtopic added" : "Topic added");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not add topic");
    }
  }

  async function archiveQuestion(question: Question) {
    try {
      await questionApi.archive(question.id);
      setQuestions((current) => current.filter((item) => item.id !== question.id));
      toast.success("Question archived");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not archive");
    } finally {
      setPendingArchive(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Question bank"
        description="Organise by topic and subtopic. Reuse the same questions across exams."
      />
      <div className="flex flex-1 overflow-hidden">
        {/* Topics */}
        <aside className="bg-card/30 flex w-72 shrink-0 flex-col border-r">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium">Topics</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {loadingTopics ? (
              <div className="text-muted-foreground flex items-center gap-2 px-2 py-4 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : roots.length === 0 ? (
              <p className="text-muted-foreground px-2 py-4 text-sm">
                No topics yet. Add your first topic below.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {roots.map((root) => (
                  <li key={root.id}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setSelectedId(root.id)}
                        className={cnRow(selectedId === root.id)}
                      >
                        <span className="truncate">{root.name}</span>
                      </button>
                      <button
                        title="Add subtopic"
                        onClick={() => {
                          setAddingChildOf((current) => (current === root.id ? null : root.id));
                          setNewChild("");
                        }}
                        className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-1.5 transition-colors"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>

                    {addingChildOf === root.id && (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void createTopic(root.id, newChild);
                        }}
                        className="mt-1 mb-1 ml-3 flex gap-1"
                      >
                        <Input
                          autoFocus
                          value={newChild}
                          onChange={(e) => setNewChild(e.target.value)}
                          placeholder="Subtopic name"
                          className="h-8"
                        />
                        <Button type="submit" size="sm" className="h-8 px-2">
                          Add
                        </Button>
                      </form>
                    )}

                    <ul className="mt-0.5 space-y-0.5">
                      {childrenOf(root.id).map((child) => (
                        <li key={child.id}>
                          <button
                            onClick={() => setSelectedId(child.id)}
                            className={cnChild(selectedId === child.id)}
                          >
                            <ChevronRight className="size-3 shrink-0 opacity-50" />
                            <span className="truncate">{child.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createTopic(null, newTopic);
            }}
            className="flex gap-1 border-t p-3"
          >
            <Input
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder="New topic"
              className="h-8"
            />
            <Button type="submit" size="sm" className="h-8 px-2" disabled={!newTopic.trim()}>
              <FolderPlus className="size-4" />
            </Button>
          </form>
        </aside>

        {/* Questions */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b px-6 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {selectedTopic ? selectedTopic.name : "Select a subtopic"}
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
                  className="h-9 w-48 pl-8"
                />
              </div>
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
              <EmptyState text="Pick a subtopic on the left, or create one, to see its questions." />
            ) : loadingQuestions ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading questions…
              </div>
            ) : questions.length === 0 ? (
              <EmptyState
                text="No questions here yet."
                action={
                  <Button
                    onClick={() => {
                      setEditing(undefined);
                      setEditorOpen(true);
                    }}
                  >
                    <Plus className="size-4" /> Add the first question
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {questions.map((question) => (
                  <li key={question.id}>
                    <Card className="gap-3 py-4">
                      <div className="flex items-start justify-between gap-4 px-5">
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{QUESTION_TYPE_LABELS[question.type]}</Badge>
                            <span className="text-muted-foreground text-xs">
                              {question.marks} mark{question.marks === 1 ? "" : "s"}
                              {question.negativeMarks > 0 ? ` · −${question.negativeMarks}` : ""}
                            </span>
                          </div>
                          <p className="line-clamp-2 text-sm">{question.prompt}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing(question);
                              setEditorOpen(true);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPendingArchive(question)}
                          >
                            <Trash2 className="text-destructive size-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
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
          onSaved={(saved) => {
            setQuestions((current) => {
              const exists = current.some((item) => item.id === saved.id);
              return exists ? current.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...current];
            });
          }}
        />
      )}

      <Dialog open={Boolean(pendingArchive)} onOpenChange={(open) => !open && setPendingArchive(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive this question?</DialogTitle>
            <DialogDescription>
              It disappears from the bank but stays attached to exams already given, so past reports never
              change.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingArchive(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => pendingArchive && void archiveQuestion(pendingArchive)}
            >
              <TriangleAlert className="size-4" /> Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function cnRow(active: boolean) {
  return [
    "flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors",
    active
      ? "bg-primary/10 text-primary"
      : "text-foreground hover:bg-accent hover:text-accent-foreground",
  ].join(" ");
}

function cnChild(active: boolean) {
  return [
    "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 pl-4 text-left text-sm transition-colors",
    active
      ? "bg-primary/10 text-primary"
      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  ].join(" ");
}

function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="border-border flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <p className="text-muted-foreground text-sm">{text}</p>
      {action}
    </div>
  );
}
