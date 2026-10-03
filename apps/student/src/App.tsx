import { ATTEMPT_STATUSES, computeAttemptDeadline } from "@kap-exam/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Logo,
} from "@kap-exam/ui";
import { useState } from "react";

/**
 * Temporary shell. It proves the workspace wiring (shared domain + shared UI)
 * works end to end. The real flow replaces this:
 *   join -> instructions -> exam (server-authoritative timer) -> submit -> result
 */
export default function App() {
  const [name, setName] = useState("");

  // Sanity check that the shared timing rules compile into the PWA bundle.
  const sampleDeadline = computeAttemptDeadline(
    { endsAt: new Date(Date.now() + 60 * 60_000), durationMinutes: 30 },
    new Date(),
  );

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo height={34} />
        <div className="space-y-1">
          <Badge variant="secondary">Join an exam</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Enter your details</h1>
          <p className="text-muted-foreground text-sm">
            Use the name and roll number exactly as your teacher knows them.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your roll number</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Rahul Sharma"
              autoComplete="name"
            />
          </div>
          <Button className="w-full" disabled={name.trim().length < 2}>
            Start exam
          </Button>
          <p className="text-muted-foreground text-center text-xs">
            Server deadline: {sampleDeadline.toISOString()} · statuses: {ATTEMPT_STATUSES.length}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
