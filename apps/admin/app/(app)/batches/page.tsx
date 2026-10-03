import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kap-exam/ui";
import { PageBody, PageHeader } from "@/components/page-header";

export default function BatchesPage() {
  return (
    <>
      <PageHeader title="Batches" description="Semester cohorts and their rosters." />
      <PageBody>
        <Card>
          <CardHeader>
            <CardTitle>Batches are next</CardTitle>
            <CardDescription>
              Create a batch, copy an existing one into a new semester, and manage the roster.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Copying a batch takes the roster, never the past exams.
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
