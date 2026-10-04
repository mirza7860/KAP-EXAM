import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, ClipboardList, Library, Users } from "lucide-react";
import Link from "next/link";
import { PageBody, PageHeader } from "@/components/page-header";

const SECTIONS = [
  {
    href: "/questions",
    title: "Question bank",
    body: "Organise questions by topic and subtopic. Everything is reusable.",
    icon: Library,
  },
  {
    href: "/batches",
    title: "Batches",
    body: "Semester cohorts and their student rosters.",
    icon: Users,
  },
  {
    href: "/exams",
    title: "Exams",
    body: "Build a paper from a topic or subtopic, then share the QR.",
    icon: ClipboardList,
  },
  {
    href: "/reports",
    title: "Reports",
    body: "Per-exam rosters and per-student report cards.",
    icon: BarChart3,
  },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Create questions once, assemble exams, share a link when students are seated."
      />
      <PageBody>
        <div className="grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <Card key={section.href} className="transition-colors hover:border-primary/40">
                <CardHeader>
                  <div className="bg-primary/10 text-primary mb-1 flex size-9 items-center justify-center rounded-lg">
                    <Icon className="size-4" />
                  </div>
                  <CardTitle>{section.title}</CardTitle>
                  <CardDescription>{section.body}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" size="sm">
                    <Link href={section.href}>Open</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}
