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
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiError, batchApi, type BatchSummary } from "@/lib/api";

export function BatchFormDialog({
  open,
  onOpenChange,
  onCreated,
  batches,
  copyFromId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (batch: BatchSummary) => void;
  /** Existing batches, for the "copy from" picker. */
  batches: BatchSummary[];
  /** Pre-select a source batch (e.g. from a card's Copy action). */
  copyFromId?: string | null;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [copy, setCopy] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [pending, setPending] = useState(false);

  // Seed the form from the parent's choice as it opens, committed during
  // render rather than after a paint carrying the previous values.
  const seed = `${open}|${copyFromId ?? ""}`;
  const [lastSeed, setLastSeed] = useState(seed);
  if (seed !== lastSeed) {
    setLastSeed(seed);
    if (open) {
      setName("");
      setDescription("");
      setSourceId(copyFromId ?? "");
      setCopy(Boolean(copyFromId));
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Give the batch a name");
      return;
    }
    if (copy && !sourceId) {
      toast.error("Choose the batch to copy");
      return;
    }
    setPending(true);
    try {
      const created = await batchApi.create({
        name: name.trim(),
        description: description.trim() || null,
        copyFromBatchId: copy ? sourceId : null,
        copyRoster: copy,
      });
      toast.success(copy ? "Batch copied for the new term" : "Batch created");
      onCreated(created);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not create the batch");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy ? "Copy batch to a new term" : "New batch"}</DialogTitle>
          <DialogDescription>
            {copy
              ? "The roster is copied. Past exams and reports stay with the original batch."
              : "A semester cohort. Students join its exams and build a report card."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="batch-name">Name</Label>
            <Input
              id="batch-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2026 Sem 2"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="batch-description">Description (optional)</Label>
            <Textarea
              id="batch-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-16"
            />
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={copy}
                onCheckedChange={(value) => setCopy(Boolean(value))}
              />
              Start by copying an existing batch
            </label>
            {copy && (
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a batch" />
                </SelectTrigger>
                <SelectContent>
                  {batches.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.name} · {batch.studentCount} students
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {copy ? "Copy batch" : "Create batch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
