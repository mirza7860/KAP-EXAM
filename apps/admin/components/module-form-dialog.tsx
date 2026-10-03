"use client";

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
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiError, moduleApi, type ModuleSummary } from "@/lib/api";

export function ModuleFormDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (module: ModuleSummary) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
    }
  }, [open]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Give the module a name");
      return;
    }
    setPending(true);
    try {
      const created = await moduleApi.create({
        name: name.trim(),
        description: description.trim() || null,
      });
      toast.success("Module created");
      onCreated(created);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not create the module");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New module</DialogTitle>
          <DialogDescription>
            A reusable set of questions. Drop the whole module into an exam later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="module-name">Name</Label>
            <Input
              id="module-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekly test — linear equations"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="module-description">Description (optional)</Label>
            <Textarea
              id="module-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-16"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Create module
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
