import { Hono } from "hono";
import type { AppBindings } from "../env.js";
import { notImplemented } from "../lib/http.js";

/**
 * Exams. Compose from modules/picked questions, then PUBLISH, which freezes the
 * paper into `exam_paper_items`. After that the exam is immutable history.
 */
export const examRoutes = new Hono<AppBindings>();

const todo = (area: string): never => {
  throw notImplemented(area);
};

examRoutes.get("/", () => todo("Listing exams"));
examRoutes.post("/", () => todo("Creating an exam"));
examRoutes.get("/:id", () => todo("Reading an exam + paper"));
examRoutes.patch("/:id", () => todo("Editing a draft exam"));

// Composition
examRoutes.post("/:id/compose", () => todo("Adding questions/modules to a draft exam"));

// Lifecycle: publish snapshots the paper and opens the join link.
examRoutes.post("/:id/publish", () => todo("Publishing an exam"));
examRoutes.post("/:id/close", () => todo("Closing an exam early"));

// Live monitoring (backed by the exam's Durable Object).
examRoutes.get("/:id/live", () => todo("Live roster and progress"));
examRoutes.get("/:id/violations", () => todo("Violation log for review"));
