import { Hono } from "hono";
import type { AppBindings } from "../env.js";
import { notImplemented } from "../lib/http.js";

/**
 * Reports. Per-exam rosters (ascending by roll no, printable) and per-student
 * cumulative report cards that span batches/semesters.
 */
export const reportRoutes = new Hono<AppBindings>();

const todo = (area: string): never => {
  throw notImplemented(area);
};

reportRoutes.get("/exams/:examId", () => todo("Per-exam report card"));
reportRoutes.get("/exams/:examId/print", () => todo("Printable per-exam roster"));
reportRoutes.get("/students/:studentId", () => todo("Per-student cumulative report card"));
reportRoutes.get("/students/:studentId/print", () => todo("Printable per-student report card"));
