import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kap-exam/ui";
import { PageBody, PageHeader } from "@/components/page-header";

export default function ExamsPage() {
  return (
    <>
      <PageHeader title="Exams" description="Compose, publish and monitor exams." />
      <PageBody>
        <Card>
          <CardHeader>
            <CardTitle>Exams are next</CardTitle>
            <CardDescription>
              Pick questions or modules, set the window and duration, then publish to freeze the paper
              and open the student link.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Publishing snapshots the paper so report cards never change later.
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
