/**
 * Podium metals. One place to define what gold / silver / bronze look like so
 * the on-screen medal and the exported PNG can never drift apart.
 */

export type MedalTier = "gold" | "silver" | "bronze";

export interface MedalColors {
  /** The face of the disc. */
  face: string;
  /** The darker rim around it — what makes it read as metal, not a dot. */
  edge: string;
  /** Shared ribbon: the brand terracotta, so all three belong to KAP. */
  ribbon: string;
  /** Digit struck into the disc. Always darker than the face. */
  digit: string;
}

export const MEDALS: Record<MedalTier, MedalColors> = {
  gold: { face: "#EFBE4F", edge: "#B98620", ribbon: "#B0562F", digit: "#4E3712" },
  silver: { face: "#CFD4DB", edge: "#8C939F", ribbon: "#B0562F", digit: "#41474F" },
  bronze: { face: "#D4884F", edge: "#99572B", ribbon: "#B0562F", digit: "#4A2A14" },
};

/**
 * 1st is gold, 2nd silver, 3rd bronze. Ties share a rank, so two students can
 * legitimately both come away with gold — that is the point of showing it.
 */
export function medalTierFor(rank: number): MedalTier | null {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return null;
}
