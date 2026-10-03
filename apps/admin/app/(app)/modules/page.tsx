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
import { ModuleFormDialog } from "@/components/module-form-dialog";
import { PageBody, PageHeader } from "@/components/page-header";
import { FolderTree, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError, moduleApi, type ModuleSummary } from "@/lib/api";

export default function ModulesPage() {
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  return (
    <>
      <PageHeader
        title="Modules"
        description="Reusable collections of questions you can drop into an exam."
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
            <p className="text-muted-foreground text-sm">
              No modules yet. Create one and start adding questions.
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
                    <Badge variant="secondary" className="shrink-0">
                      {module.questionCount} Q
                    </Badge>
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
    </>
  );
}
