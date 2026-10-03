import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Logo,
} from "@kap-exam/ui";

const sections = [
  {
    title: "Question bank",
    body: "Topics, subtopics and reusable modules — build once, reuse every term.",
  },
  {
    title: "Batches",
    body: "Copy a semester, keep the roster, start the new term clean.",
  },
  {
    title: "Reports",
    body: "Per-exam rosters and per-student report cards that span semesters.",
  },
];

/**
 * Temporary dashboard shell. Proves the workspace wiring (shared domain +
 * shared UI + Tailwind v4 scanning the shared package) end to end.
 */
export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-card/60 supports-[backdrop-filter]:bg-card/50 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-8 py-4">
          <div className="flex items-center gap-3">
            <Logo height={30} />
            <span className="bg-border hidden h-6 w-px sm:block" />
            <span className="text-muted-foreground hidden text-sm sm:block">Teacher dashboard</span>
          </div>
          <Button>New exam</Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-8 py-10">
        <div className="flex flex-col gap-2">
          <Badge variant="secondary" className="w-fit">
            Welcome back
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Your exam workspace</h1>
          <p className="text-muted-foreground max-w-xl text-sm">
            Create questions once, assemble them into exams, and hand students a link when
            they&rsquo;re seated.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {sections.map((item) => (
            <Card key={item.title} className="transition-colors hover:border-primary/40">
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
    </div>
  );
}
