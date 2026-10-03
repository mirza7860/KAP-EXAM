import { z } from "zod";

/**
 * Identity primitives.
 *
 * A student is "account-less but identified": no password, but a stable record
 * so report cards can span semesters. Match key is (institution, normalized
 * roll no) as chosen in the architecture review.
 */

/** Lowercase + collapse whitespace + strip punctuation that varies by handwriting. */
export function normalizeRollNo(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s/\\_.-]+/g, "");
}

/** Collapse whitespace and lowercase for comparison-only usage. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export const rollNoSchema = z
  .string()
  .trim()
  .min(1, "Roll number is required")
  .max(32, "Roll number is too long");

export const studentNameSchema = z
  .string()
  .trim()
  .min(2, "Name is required")
  .max(80, "Name is too long");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email");

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Password is too long");

export const batchNameSchema = z
  .string()
  .trim()
  .min(1, "Batch name is required")
  .max(80, "Batch name is too long");
