import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kap-exam/ui";
import { PageBody, PageHeader } from "@/components/page-header";

export default function ModulesPage() {
  return (
    <>
      <PageHeader title="Modules" description="Saved collections of questions, reusable across exams." />
      <PageBody>
        <Card>
          <CardHeader>
            <CardTitle>Modules are next</CardTitle>
            <CardDescription>
              Create a module, add questions from the bank, then drop the whole module into an exam.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            The API for modules is already live. This screen is the next thing to build.
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
