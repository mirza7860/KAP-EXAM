import { describe, expect, it } from "vitest";
import {
  computeAttemptDeadline,
  isWindowOpen,
  msRemaining,
  normalizeName,
  normalizeRollNo,
} from "@kap-exam/shared";

describe("normalizeRollNo", () => {
  it("treats handwritten variants as the same student", () => {
    expect(normalizeRollNo("R-01")).toBe(normalizeRollNo("r 01"));
    expect(normalizeRollNo("R/01")).toBe(normalizeRollNo("r_01"));
    expect(normalizeRollNo("  R-01 ")).toBe("r01");
  });

  it("keeps distinct rolls distinct", () => {
    expect(normalizeRollNo("R-01")).not.toBe(normalizeRollNo("R-02"));
  });
});

describe("normalizeName", () => {
  it("collapses case and whitespace for comparison", () => {
    expect(normalizeName("  Rahul   Sharma ")).toBe("rahul sharma");
  });
});

describe("fixed wall-clock timing", () => {
  const schedule = {
    startsAt: new Date("2026-10-04T10:00:00Z"),
    endsAt: new Date("2026-10-04T11:00:00Z"),
    durationMinutes: 30,
  };

  it("gives a full duration to an on-time joiner", () => {
    const deadline = computeAttemptDeadline(schedule, new Date("2026-10-04T10:00:00Z"));
    expect(deadline).toEqual(new Date("2026-10-04T10:30:00Z"));
  });

  it("clamps a late joiner to the wall-clock close", () => {
    const deadline = computeAttemptDeadline(schedule, new Date("2026-10-04T10:45:00Z"));
    expect(deadline).toEqual(new Date("2026-10-04T11:00:00Z"));
  });

  it("opens and closes the window at the right instants", () => {
    expect(isWindowOpen(schedule, new Date("2026-10-04T09:59:59Z"))).toBe(false);
    expect(isWindowOpen(schedule, new Date("2026-10-04T10:00:00Z"))).toBe(true);
    expect(isWindowOpen(schedule, new Date("2026-10-04T11:00:00Z"))).toBe(false);
  });

  it("never reports negative remaining time", () => {
    expect(msRemaining(new Date("2026-10-04T10:00:00Z"), new Date("2026-10-04T11:00:00Z"))).toBe(0);
  });
});
