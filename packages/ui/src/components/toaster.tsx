"use client";

import { Toaster as Sonner, toast, type ToasterProps } from "sonner";
import type { CSSProperties } from "react";

/**
 * App-wide toasts. Theme follows the system (matching the rest of the app).
 * Sonner is intentionally a touch slower and uses `ease` — it matches the
 * calm, warm personality rather than a snappy dashboard.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="top-right"
      closeButton
      toastOptions={{ duration: 3500 }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster, toast };
export type { ToasterProps };
