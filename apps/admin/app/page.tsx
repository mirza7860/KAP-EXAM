import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kap-exam/ui";

/**
 * Temporary dashboard shell. Proves the workspace wiring (shared domain +
 * shared UI + Tailwind v4 scanning the shared package) end to end.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">KAP Exam</h1>
          <p className="text-muted-foreground text-sm">Teacher dashboard</p>
        </div>
        <Button>New exam</Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { title: "Question bank", body: "Topics, subtopics and reusable modules." },
          { title: "Batches", body: "Copy a semester, keep the roster, reset the exams." },
          { title: "Reports", body: "Per-exam rosters and per-student report cards." },
        ].map((item) => (
          <Card key={item.title}>
            <CardHeader>
              <CardTitle>{item.title}</CardTitle>
              <CardDescription>{item.body}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm">
                Open
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
