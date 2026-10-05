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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageBody, PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { StudentProfile } from "@/components/student-profile";
import { ArrowLeft, Loader2, Pencil, Plus, UserMinus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiError, batchApi, type BatchDetail, type RosterEntry } from "@/lib/api";

const PAGE_SIZE = 15;

export default function BatchDetailPage() {
  const params = useParams<{ id: string }>();
  const batchId = params.id;

  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterTotal, setRosterTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [profileStudentId, setProfileStudentId] = useState<string | null>(null);

  // `loading` starts true; this only settles it. Callers that want the
  // spinner re-arm it from their own event handler.
  const load = useCallback(
    (pageOffset: number, pageLimit: number) =>
      Promise.all([
        batchApi.get(batchId),
        batchApi.students(batchId, { limit: pageLimit, offset: pageOffset }),
      ])
        .then(([detail, rosterPage]) => {
          setBatch(detail);
          setRoster(rosterPage.items);
          setRosterTotal(rosterPage.total);
        })
        .catch((error) => {
          toast.error(error instanceof ApiError ? error.message : "Could not load the batch");
        })
        .finally(() => setLoading(false)),
    [batchId],
  );

  useEffect(() => {
    void load(offset, limit);
  }, [load, offset, limit]);

  async function removeStudent(studentId: string, name: string) {
    if (!batch) return;
    try {
      await batchApi.removeStudent(batch.id, studentId);
      setRoster((current) => current.filter((entry) => entry.studentId !== studentId));
      setRosterTotal((current) => Math.max(0, current - 1));
      setBatch((current) =>
        current ? { ...current, studentCount: Math.max(0, current.studentCount - 1) } : current,
      );
      // Deleting the last row on a page steps back rather than showing a blank one.
      if (roster.length <= 1 && offset > 0) setOffset(Math.max(0, offset - limit));
      toast.success(`Removed ${name} from the batch`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not remove the student");
    }
  }

  return (
    <>
      <PageHeader
        title={batch?.name ?? "Batch"}
        description={
          batch ? `${batch.studentCount} student${batch.studentCount === 1 ? "" : "s"}` : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/batches">
                <ArrowLeft className="size-4" /> All batches
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRenameOpen(true)}
              disabled={!batch}
            >
              <Pencil className="size-4" /> Rename
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)} disabled={!batch}>
              <Plus className="size-4" /> Add student
            </Button>
          </div>
        }
      />
      <PageBody>
        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : !batch ? (
          <p className="text-muted-foreground text-sm">Batch not found.</p>
        ) : rosterTotal === 0 ? (
          <div className="border-border flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <p className="text-muted-foreground text-sm">
              No students yet. Add them, or copy a previous batch to bring the roster across.
            </p>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add student
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Roll no</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Joined</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map((entry) => (
                    <TableRow
                      key={entry.studentId}
                      className="cursor-pointer"
                      onClick={() => setProfileStudentId(entry.studentId)}
                    >
                      <TableCell className="font-mono text-xs">{entry.rollNo}</TableCell>
                      <TableCell className="font-medium">
                        {entry.name}
                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                          view report →
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                        {new Date(entry.joinedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void removeStudent(entry.studentId, entry.name)}
                        >
                          <UserMinus className="text-destructive size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination
              total={rosterTotal}
              limit={limit}
              offset={offset}
              noun="students"
              onChange={({ limit: nextLimit, offset: nextOffset }) => {
                setLoading(true);
                setLimit(nextLimit);
                setOffset(nextOffset);
              }}
            />
          </>
        )}
      </PageBody>

      {batch && (
        <>
          <AddStudentDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            batchId={batch.id}
            onAdded={() => {
              setLoading(true);
              void load(offset, limit);
            }}
          />
          <RenameBatchDialog
            open={renameOpen}
            onOpenChange={setRenameOpen}
            batch={batch}
            onRenamed={(updated) => setBatch({ ...batch, ...updated })}
          />
          <StudentProfile
            studentId={profileStudentId}
            activeBatchId={batch.id}
            open={profileStudentId !== null}
            onOpenChange={(open) => !open && setProfileStudentId(null)}
          />
        </>
      )}
    </>
  );
}

function AddStudentDialog({
  open,
  onOpenChange,
  batchId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [pending, setPending] = useState(false);

  // Clear the fields as the sheet opens, committed during render so the first
  // paint is already correct rather than showing the previous student.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setRollNo("");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !rollNo.trim()) {
      toast.error("Enter a name and roll number");
      return;
    }
    setPending(true);
    try {
      await batchApi.addStudent(batchId, { name: name.trim(), rollNo: rollNo.trim() });
      toast.success("Student added");
      onAdded();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not add the student");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add student</DialogTitle>
          <DialogDescription>
            Matching roll numbers are treated as the same person across semesters.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="student-roll">Roll number</Label>
            <Input
              id="student-roll"
              autoFocus
              value={rollNo}
              onChange={(e) => setRollNo(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="student-name">Name</Label>
            <Input id="student-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameBatchDialog({
  open,
  onOpenChange,
  batch,
  onRenamed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batch: BatchDetail;
  onRenamed: (batch: { name: string; description: string | null }) => void;
}) {
  const [name, setName] = useState(batch.name);
  const [description, setDescription] = useState(batch.description ?? "");
  const [pending, setPending] = useState(false);

  // Same contract: seed from the batch as it opens, not after it has painted
  // with whatever was renamed last time.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(batch.name);
      setDescription(batch.description ?? "");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const updated = await batchApi.update(batch.id, {
        name: name.trim(),
        description: description.trim() || null,
      });
      toast.success("Batch updated");
      onRenamed({ name: updated.name, description: updated.description });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not update the batch");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename batch</DialogTitle>
          <DialogDescription>Renaming never changes past exams or report cards.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rename-name">Name</Label>
            <Input id="rename-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rename-description">Description (optional)</Label>
            <Textarea
              id="rename-description"
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
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
