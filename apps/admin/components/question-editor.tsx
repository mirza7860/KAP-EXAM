"use client";

import type { Question, QuestionInput, QuestionType } from "@kap-exam/shared";
import { QUESTION_TYPE_LABELS, emptyMcqOptions } from "@/lib/question-form";
import { Button } from "@/components/ui/button";
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
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { LatexEditor } from "@kap-exam/ui";
import { ApiError, api, mediaUrl, questionApi } from "@/lib/api";

interface DraftState {
  type: QuestionType;
  prompt: string;
  mediaKey: string | null;
  options: { id: string; text: string }[];
  correctOptionIds: string[];
  correctNumber: string;
  numericTolerance: string;
  marks: string;
  negativeMarks: string;
  explanation: string;
}

function toDraft(question?: Question): DraftState {
  if (!question) {
    return {
      type: "mcq_single",
      prompt: "",
      mediaKey: null,
      options: emptyMcqOptions(),
      correctOptionIds: [],
      correctNumber: "",
      numericTolerance: "",
      marks: "1",
      negativeMarks: "0",
      explanation: "",
    };
  }
  return {
    type: question.type,
    prompt: question.prompt,
    mediaKey: question.mediaKey,
    options: question.options.length ? question.options : emptyMcqOptions(),
    correctOptionIds: question.correctOptionIds,
    correctNumber: question.correctNumber === null ? "" : String(question.correctNumber),
    numericTolerance: question.numericTolerance === null ? "" : String(question.numericTolerance),
    marks: String(question.marks),
    negativeMarks: String(question.negativeMarks),
    explanation: question.explanation ?? "",
  };
}

export function QuestionEditor({
  open,
  onOpenChange,
  subtopicId,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtopicId: string;
  initial?: Question;
  onSaved: (question: Question) => void;
}) {
  const [draft, setDraft] = useState<DraftState>(() => toDraft(initial));
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset the form each time it opens. This is committed during render and
  // guarded by the previous value, so the dialog never paints the question you
  // just finished editing before correcting itself.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(toDraft(initial));
  }

  const isChoice = draft.type === "mcq_single" || draft.type === "mcq_multi";

  function patch(update: Partial<DraftState>) {
    setDraft((current) => ({ ...current, ...update }));
  }

  function changeType(type: QuestionType) {
    if (type === "mcq_single" || type === "mcq_multi") {
      patch({
        type,
        options: draft.options.length ? draft.options : emptyMcqOptions(),
        correctOptionIds: draft.correctOptionIds.slice(0, type === "mcq_single" ? 1 : undefined),
      });
    } else {
      patch({ type, correctOptionIds: type === "true_false" ? ["true"] : [] });
    }
  }

  function toggleCorrect(optionId: string) {
    if (draft.type === "mcq_single") {
      patch({ correctOptionIds: [optionId] });
      return;
    }
    const set = new Set(draft.correctOptionIds);
    if (set.has(optionId)) set.delete(optionId);
    else set.add(optionId);
    patch({ correctOptionIds: [...set] });
  }

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const result = await api.upload<{ key: string }>("/api/media", file);
      patch({ mediaKey: result.key });
      toast.success("Image uploaded");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function buildInput(): QuestionInput | null {
    const marks = Number(draft.marks);
    const negativeMarks = Number(draft.negativeMarks || "0");
    if (!draft.prompt.trim()) {
      toast.error("Write the question prompt");
      return null;
    }
    if (!Number.isFinite(marks) || marks <= 0) {
      toast.error("Marks must be greater than zero");
      return null;
    }

    const base = {
      subtopicId,
      type: draft.type,
      prompt: draft.prompt.trim(),
      mediaKey: draft.mediaKey,
      marks,
      negativeMarks: Number.isFinite(negativeMarks) ? negativeMarks : 0,
      explanation: draft.explanation.trim() || null,
    };

    if (isChoice) {
      if (draft.options.some((option) => !option.text.trim())) {
        toast.error("Fill in all four options");
        return null;
      }
      if (draft.correctOptionIds.length === 0) {
        toast.error("Mark at least one correct option");
        return null;
      }
      return {
        ...base,
        options: draft.options.map((option) => ({ ...option, text: option.text.trim() })),
        correctOptionIds: draft.correctOptionIds,
        correctNumber: null,
        numericTolerance: null,
      };
    }

    if (draft.type === "true_false") {
      return {
        ...base,
        options: [],
        correctOptionIds: draft.correctOptionIds.length ? draft.correctOptionIds : ["true"],
        correctNumber: null,
        numericTolerance: null,
      };
    }

    // numeric
    const correctNumber = Number(draft.correctNumber);
    if (!Number.isFinite(correctNumber) || draft.correctNumber.trim() === "") {
      toast.error("Enter the correct numeric answer");
      return null;
    }
    const tolerance = draft.numericTolerance.trim() === "" ? null : Number(draft.numericTolerance);
    return {
      ...base,
      options: [],
      correctOptionIds: [],
      correctNumber,
      numericTolerance: tolerance !== null && Number.isFinite(tolerance) ? tolerance : null,
    };
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const input = buildInput();
    if (!input) return;
    setPending(true);
    try {
      const saved = initial
        ? await questionApi.update(initial.id, input)
        : await questionApi.create(input);
      toast.success(initial ? "Question updated" : "Question saved");
      onSaved(saved);
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? (error.fields ? Object.values(error.fields).flat()[0] : undefined) ?? error.message
          : "Could not save the question";
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit question" : "New question"}</DialogTitle>
          <DialogDescription>
            Pick a type. Diagrams are optional and uploaded straight to storage.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="q-type">Type</Label>
              <Select value={draft.type} onValueChange={(value) => changeType(value as QuestionType)}>
                <SelectTrigger id="q-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="q-marks">Marks</Label>
                <Input
                  id="q-marks"
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={draft.marks}
                  onChange={(e) => patch({ marks: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-negative">Negative</Label>
                <Input
                  id="q-negative"
                  type="number"
                  min="0"
                  step="0.5"
                  value={draft.negativeMarks}
                  onChange={(e) => patch({ negativeMarks: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="q-prompt">Question</Label>
            <LatexEditor
              id="q-prompt"
              ariaLabel="Question prompt"
              value={draft.prompt}
              onChange={(prompt) => patch({ prompt })}
              rows={4}
              placeholder="Type the question exactly as students should read it. Use $…$ for maths, $$…$$ for a display line."
            />
          </div>

          {/* Diagram upload */}
          <div className="space-y-2">
            <Label>Diagram (optional)</Label>
            {draft.mediaKey ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl(draft.mediaKey)}
                  alt="Question diagram"
                  className="border-border h-20 rounded-md border object-contain"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => patch({ mediaKey: null })}
                >
                  <Trash2 className="size-4" /> Remove
                </Button>
              </div>
            ) : (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadImage(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                  {uploading ? "Uploading…" : "Upload image"}
                </Button>
              </div>
            )}
          </div>

          {/* Answer area, per type */}
          {isChoice && (
            <div className="space-y-2">
              <Label>
                Options{" "}
                <span className="text-muted-foreground font-normal">
                  (tick the {draft.type === "mcq_single" ? "one correct" : "correct"} answer
                  {draft.type === "mcq_multi" ? "s" : ""})
                </span>
              </Label>
              <div className="space-y-2">
                {draft.options.map((option, index) => {
                  const correct = draft.correctOptionIds.includes(option.id);
                  return (
                    <div key={option.id} className="flex items-center gap-3">
                      <input
                        type={draft.type === "mcq_single" ? "radio" : "checkbox"}
                        name="correct"
                        checked={correct}
                        onChange={() => toggleCorrect(option.id)}
                        className="accent-primary size-4"
                        aria-label={`Mark option ${index + 1} correct`}
                      />
                      <Input
                        value={option.text}
                        placeholder={`Option ${String.fromCharCode(65 + index)}`}
                        onChange={(e) => {
                          const options = draft.options.map((current) =>
                            current.id === option.id ? { ...current, text: e.target.value } : current,
                          );
                          patch({ options });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <p className="text-muted-foreground text-xs">
                Type maths straight in: <code className="font-mono">$x^2$</code>,{" "}
                <code className="font-mono">$\sqrt{2}$</code>.
              </p>
            </div>
          )}

          {draft.type === "true_false" && (
            <div className="space-y-2">
              <Label>Correct answer</Label>
              <div className="flex gap-2">
                {(["true", "false"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant={draft.correctOptionIds[0] === value ? "default" : "outline"}
                    onClick={() => patch({ correctOptionIds: [value] })}
                  >
                    {value === "true" ? "True" : "False"}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {draft.type === "numeric" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="q-number">Correct answer</Label>
                <Input
                  id="q-number"
                  type="number"
                  step="any"
                  value={draft.correctNumber}
                  onChange={(e) => patch({ correctNumber: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-tolerance">Tolerance (±, optional)</Label>
                <Input
                  id="q-tolerance"
                  type="number"
                  min="0"
                  step="any"
                  value={draft.numericTolerance}
                  onChange={(e) => patch({ numericTolerance: e.target.value })}
                  placeholder="e.g. 0.01"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="q-explanation">Explanation (optional)</Label>
            <LatexEditor
              id="q-explanation"
              ariaLabel="Explanation"
              value={draft.explanation}
              onChange={(explanation) => patch({ explanation })}
              rows={3}
              placeholder="Why that answer is correct. Shown when reviewing answers."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || uploading}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {initial ? "Save changes" : "Save question"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
