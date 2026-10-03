import { Hono } from "hono";
import type { AppBindings } from "../env.js";
import { notImplemented } from "../lib/http.js";

/** Question bank: topics -> subtopics -> questions, plus reusable modules. */
export const questionRoutes = new Hono<AppBindings>();

const todo = (area: string): never => {
  throw notImplemented(area);
};

// Topics / subtopics (self-referential tree)
questionRoutes.get("/topics", () => todo("Listing topics"));
questionRoutes.post("/topics", () => todo("Creating a topic"));
questionRoutes.patch("/topics/:id", () => todo("Renaming/moving a topic"));
questionRoutes.delete("/topics/:id", () => todo("Archiving a topic"));

// Questions
questionRoutes.get("/questions", () => todo("Listing/filtering questions"));
questionRoutes.post("/questions", () => todo("Creating a question"));
questionRoutes.get("/questions/:id", () => todo("Reading a question"));
questionRoutes.patch("/questions/:id", () => todo("Editing a question"));
questionRoutes.delete("/questions/:id", () => todo("Archiving a question"));

// Reusable modules ("like Google Drive")
questionRoutes.get("/modules", () => todo("Listing modules"));
questionRoutes.post("/modules", () => todo("Creating a module"));
questionRoutes.patch("/modules/:id", () => todo("Editing a module"));
questionRoutes.delete("/modules/:id", () => todo("Archiving a module"));
questionRoutes.post("/modules/:id/questions", () => todo("Adding questions to a module"));
questionRoutes.delete("/modules/:id/questions/:questionId", () => todo("Removing a question from a module"));
