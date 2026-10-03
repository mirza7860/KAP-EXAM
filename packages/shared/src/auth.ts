import { z } from "zod";
import { emailSchema, passwordSchema } from "./identity";

/** Teacher auth lives in the Worker (in-app email/password). */

export const teacherSignUpSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
});

export type TeacherSignUpInput = z.infer<typeof teacherSignUpSchema>;

export const teacherSignInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export type TeacherSignInInput = z.infer<typeof teacherSignInSchema>;

export const sessionSchema = z.object({
  teacherId: z.string().min(1),
  name: z.string(),
  email: z.string(),
  role: z.enum(["owner", "teacher"]),
  expiresAt: z.coerce.date(),
});

export type Session = z.infer<typeof sessionSchema>;
