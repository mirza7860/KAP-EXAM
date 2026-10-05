"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@kap-exam/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiError, authApi } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { teacher, loading, signIn, signUp } = useSession();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  // null until we hear from the Worker. Nothing is offered while unknown, so
  // a closed registration never flashes a link first.
  const [signupOpen, setSignupOpen] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading && teacher) router.replace("/dashboard");
  }, [loading, teacher, router]);

  // Fails open: the link is cosmetic, the Worker rejects the signup anyway,
  // and hiding it on a network error would strand the first account.
  useEffect(() => {
    authApi
      .signupStatus()
      .then((d) => setSignupOpen(d.open))
      .catch(() => setSignupOpen(true));
  }, []);

  const canSignUp = signupOpen === true;
  const active = canSignUp ? mode : "signin";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      if (active === "signin") await signIn(email, password);
      else await signUp(name, email, password);
      toast.success(active === "signin" ? "Welcome back" : "Account created");
      router.replace("/dashboard");
    } catch (error) {
      const message =
        error instanceof ApiError
          ? (error.fields ? Object.values(error.fields).flat()[0] : undefined) ?? error.message
          : "Something went wrong";
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-6 p-6">
      <Logo height={34} />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{active === "signin" ? "Sign in" : "Create your account"}</CardTitle>
          <CardDescription>Teacher access to the KAP exam workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {active === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={active === "signin" ? "current-password" : "new-password"}
                required
                minLength={active === "signup" ? 8 : undefined}
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Please wait…" : active === "signin" ? "Sign in" : "Create account"}
            </Button>
            {canSignUp && (
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="text-muted-foreground hover:text-foreground w-full text-center text-sm transition-colors"
              >
                {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
              </button>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
