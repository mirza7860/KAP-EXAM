import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageBody, PageHeader } from "@/components/page-header";

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" description="Printable per-exam rosters and per-student report cards." />
      <PageBody>
        <Card>
          <CardHeader>
            <CardTitle>Reports are next</CardTitle>
            <CardDescription>
              Each exam gets its own roster; each student gets a history across semesters.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Includes marks, unattempted questions and attendance.
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
