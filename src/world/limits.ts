/**
 * Session-shaping constants — the single source so morning-round.ts and
 * scene-router.ts can't drift (design docs/design/06). Pure data, no logic.
 */

export const ACTIVE_SET_CAP = 120; // greenhouse size (Lex active learning set)
export const WILD_DUE_PER_SESSION = 5; // max wild promotions surfaced per Morning Round
export const MAX_POCKET_VISITS = 5; // Grove, Bench, Meadow+Weather, +1 optional 2nd Grove
export const WALK_FLOOR_MS = 1500; // hard cognitive-cooldown floor per inter-pocket walk
export const GROVE_WALK_CAP = 12; // absolute Grove ceiling / Morning Round (comeback days)
export const GROVE_CAP = 8; // steady-state Grove batch target
export const BENCH_CAP = 4; // due crown classes / visit
export const FLUX_CAP = 15; // Meadow+Weather flux trials / visit
export const CSI_MS = 700; // Biome cue→stimulus interval (A/B against {400,1200})
export const NEW_BASE = 8; // new Lex cards admitted on a normal tended day
export const STUDY_AHEAD_NEW_MAX = 20; // ceiling for new cards/day incl. wander-mode

/** Template counts per kingdom (body-plan families baked to the atlas). */
export const TEMPLATES_PER_KINGDOM = {
  FLORA: 24,
  FAUNA: 16,
  MODIFIER: 12,
  STRUCTURE: 8,
} as const;
