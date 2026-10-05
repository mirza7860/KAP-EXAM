"use client";

import type { Session } from "@kap-exam/shared";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi, getToken, setToken } from "./api";

interface SessionContextValue {
  teacher: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [teacher, setTeacher] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore a session on first load if a token is present. The no-token case
  // goes through the same settled promise so the effect body itself never
  // commits state — it only starts the work.
  useEffect(() => {
    let cancelled = false;
    const restoring = getToken() ? authApi.me() : Promise.resolve(null);
    restoring
      .then((session) => {
        if (!cancelled && session) setTeacher(session);
      })
      .catch(() => {
        setToken(null);
        if (!cancelled) setTeacher(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authApi.signIn(email, password);
    setToken(result.token);
    setTeacher(result);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const result = await authApi.signUp(name, email, password);
    setToken(result.token);
    setTeacher(result);
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setTeacher(null);
  }, []);

  return (
    <SessionContext.Provider value={{ teacher, loading, signIn, signUp, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used within <SessionProvider>");
  return context;
}
