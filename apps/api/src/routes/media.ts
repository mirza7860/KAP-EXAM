import { Hono } from "hono";
import type { AppBindings } from "../env.js";
import { badRequest, notFound } from "../lib/http.js";
import { requireTeacher } from "../middleware/auth.js";

/**
 * Question media (diagrams, images) stored in R2.
 *
 * - Upload is teacher-only and namespaced under a random key.
 * - Serving is public but keyed by an unguessable id, so the student PWA can
 *   render a diagram mid-exam without a session.
 * - Cache-Control is short: exam media must not be cached for long (the PWA
 *   service worker also never caches API traffic).
 */
export const mediaRoutes = new Hono<AppBindings>();

function safeName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 60) || "image";
}

mediaRoutes.post("/", requireTeacher, async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Attach an image file in the `file` field");
  if (!file.type.startsWith("image/")) throw badRequest("Only image uploads are supported");
  if (file.size > 8 * 1024 * 1024) throw badRequest("Image must be under 8 MB");

  const key = `${crypto.randomUUID()}-${safeName(file.name)}`;
  await c.env.MATERIALS_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { uploadedBy: c.get("teacher").teacherId },
  });

  return c.json({ data: { key, contentType: file.type, size: file.size } }, 201);
});

mediaRoutes.get("/:key", async (c) => {
  const object = await c.env.MATERIALS_BUCKET.get(c.req.param("key"));
  if (!object) throw notFound("Image not found");

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=300");
  return new Response(object.body, { headers });
});
