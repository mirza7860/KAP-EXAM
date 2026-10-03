import { Hono } from "hono";
import type { AppBindings } from "../env.js";
import { notImplemented } from "../lib/http.js";

/**
 * Batches = semester cohorts. Copying a batch copies the roster and settings,
 * never past exams or reports (see architecture decisions).
 */
export const batchRoutes = new Hono<AppBindings>();

const todo = (area: string): never => {
  throw notImplemented(area);
};

batchRoutes.get("/", () => todo("Listing batches"));
batchRoutes.post("/", () => todo("Creating/copying a batch"));
batchRoutes.get("/:id", () => todo("Reading a batch"));
batchRoutes.patch("/:id", () => todo("Renaming a batch"));
batchRoutes.delete("/:id", () => todo("Archiving a batch"));
batchRoutes.get("/:id/students", () => todo("Listing a batch roster"));
batchRoutes.post("/:id/students", () => todo("Adding a student to a batch"));
