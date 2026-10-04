"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ModuleFormDialog } from "@/components/module-form-dialog";
import { NameDialog } from "@/components/name-dialog";
import { PageBody, PageHeader } from "@/components/page-header";
import { FolderTree, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError, moduleApi, type ModuleSummary } from "@/lib/api";

export default function ModulesPage() {
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [renaming, setRenaming] = useState<ModuleSummary | null>(null);
  const [deleting, setDeleting] = useState<ModuleSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setModules(await moduleApi.list());
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not load modules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function rename(name: string) {
    if (!renaming) return;
    try {
      const updated = await moduleApi.update(renaming.id, { name });
      setModules((current) => current.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
      toast.success("Renamed");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not rename");
    }
  }

  async function remove(module: ModuleSummary) {
    try {
      await moduleApi.remove(module.id);
      setModules((current) => current.filter((m) => m.id !== module.id));
      toast.success("Module deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not delete");
    }
  }

  return (
    <>
      <PageHeader
        title="Modules"
        description="Saved sets of questions you can reuse — build one exam, reuse it next term."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> New module
          </Button>
        }
      />
      <PageBody>
        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading modules…
          </div>
        ) : modules.length === 0 ? (
          <div className="border-border flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <FolderTree className="text-muted-foreground size-6" />
            <p className="text-muted-foreground max-w-sm text-sm">
              A module is a reusable set of questions — like “Weekly test set”. Create one and add
              questions from the bank.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" /> New module
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((module) => (
              <Card key={module.id} className="transition-colors hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="truncate">{module.name}</CardTitle>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant="secondary">{module.questionCount} Q</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setDeleting(null);
                              setRenaming(module);
                            }}
                          >
                            <Pencil /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/modules/${module.id}`}>
                              <FolderTree /> Open
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeleting(module)}
                          >
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {module.description || "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/modules/${module.id}`}>Open</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <ModuleFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(module) => setModules((current) => [module, ...current])}
      />

      <NameDialog
        open={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
        title="Rename module"
        label="Module name"
        initialName={renaming?.name ?? ""}
        submitLabel="Rename"
        onSubmit={rename}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="The module is removed. The questions themselves stay in the question bank."
        confirmLabel="Delete module"
        onConfirm={async () => {
          if (deleting) await remove(deleting);
        }}
      />
    </>
  );
}
