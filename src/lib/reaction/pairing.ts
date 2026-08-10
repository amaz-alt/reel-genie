/**
 * Reaction + Demo module — pure pairing / variation logic.
 *
 * Deliberately dependency-free so both the server functions and the UI can
 * reuse it. Nothing here is shared with the typography reels engine.
 */

export type AssetKind = "reaction" | "demo";

export type AssetTags = {
  /** One-line description of what is visibly happening. */
  summary?: string;
  /** Reactions: the felt emotion. Demos: the emotion the feature should trigger. */
  emotion?: string;
  energy?: "low" | "medium" | "high";
  /** Demos: the feature/topic being shown. Reactions: topics it suits. */
  topics?: string[];
  /** Free tags used for cross-matching (e.g. "time-saving", "before-after"). */
  pairsWith?: string[];
  bestUse?: string;
  /** Demos only: what the product visibly does, for hook writing. */
  showcases?: string;
  suitability?: "hook" | "payoff" | "either";
};

export type ReactionAsset = {
  id: string;
  kind: AssetKind;
  storage_path: string;
  label: string | null;
  duration_seconds: number | null;
  ai_tags: AssetTags;
  last_used_at: string | null;
  use_count: number;
};

export const ARRANGEMENTS = ["reaction-cut", "reaction-pip", "split-stack", "demo-first"] as const;
export type Arrangement = (typeof ARRANGEMENTS)[number];

export const TEXT_STYLES = ["caption-bar", "boxed", "clean"] as const;
export type TextStyle = (typeof TEXT_STYLES)[number];

export const HOOK_PLACEMENTS = ["reaction", "demo", "both"] as const;
export type HookPlacement = (typeof HOOK_PLACEMENTS)[number];

export const HOOK_TIMINGS = ["instant", "on-beat", "delayed"] as const;
export type HookTiming = (typeof HOOK_TIMINGS)[number];

/** Deterministic 0..1 stream from a seed. */
export function makeRandom(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function norm(list: string[] | undefined) {
  return (list ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean);
}

function overlap(a: string[], b: string[]) {
  const set = new Set(b);
  return a.filter((x) => set.has(x)).length;
}

/**
 * Compatibility score between a demo clip and a candidate reaction clip.
 * Higher = more natural pairing. This is what replaces random pairing.
 */
export function pairScore(demo: ReactionAsset, reaction: ReactionAsset): number {
  const d = demo.ai_tags ?? {};
  const r = reaction.ai_tags ?? {};
  let score = 0;

  score += overlap(norm(d.topics), norm(r.topics)) * 3;
  score += overlap(norm(d.pairsWith), norm(r.pairsWith)) * 2.5;
  score += overlap(norm(d.topics), norm(r.pairsWith)) * 2;
  score += overlap(norm(d.pairsWith), norm(r.topics)) * 2;

  // A demo meant to impress lands best on a high-energy reaction; a calm
  // "this saves me time" demo lands on a softer one.
  const energyRank = { low: 0, medium: 1, high: 2 } as const;
  if (d.energy && r.energy) {
    score += 2 - Math.abs(energyRank[d.energy] - energyRank[r.energy]);
  }
  if (d.emotion && r.emotion && d.emotion.toLowerCase() === r.emotion.toLowerCase()) score += 2;

  // Freshness: prefer clips that have not been used recently.
  score -= Math.min(3, (reaction.use_count ?? 0) * 0.4);
  if (reaction.last_used_at) {
    const days = (Date.now() - new Date(reaction.last_used_at).getTime()) / 86_400_000;
    if (days < 1) score -= 2.5;
    else if (days < 3) score -= 1.2;
  }
  return score;
}

/** Least-recently-used demo, so the library rotates instead of repeating. */
export function pickDemo(demos: ReactionAsset[], rand: () => number): ReactionAsset | null {
  if (!demos.length) return null;
  const sorted = [...demos].sort((a, b) => {
    const at = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
    const bt = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
    if (at !== bt) return at - bt;
    return (a.use_count ?? 0) - (b.use_count ?? 0);
  });
  // Sample from the freshest third so consecutive runs aren't fully predictable.
  const window = Math.max(1, Math.ceil(sorted.length / 3));
  return sorted[Math.floor(rand() * window)] ?? sorted[0];
}

export function pickReaction(
  demo: ReactionAsset,
  reactions: ReactionAsset[],
  rand: () => number,
): ReactionAsset | null {
  if (!reactions.length) return null;
  const scored = reactions
    .map((r) => ({ r, score: pairScore(demo, r) }))
    .sort((a, b) => b.score - a.score);
  const window = Math.max(1, Math.min(4, Math.ceil(scored.length / 4)));
  return scored[Math.floor(rand() * window)]?.r ?? scored[0].r;
}

export type VariationPlan = {
  arrangement: Arrangement;
  textStyle: TextStyle;
  hookPlacement: HookPlacement;
  hookTiming: HookTiming;
  reactionSeconds: number;
  demoSeconds: number;
  demoStartFrom: number;
  reactionStartFrom: number;
  totalSeconds: number;
};

/**
 * Build the shape of one generation. Every knob is seeded, and the last few
 * arrangements used by this brand are avoided so back-to-back reels differ.
 */
export function buildVariation(opts: {
  seed: number;
  demo: ReactionAsset;
  reaction: ReactionAsset;
  recentArrangements: string[];
}): VariationPlan {
  const rand = makeRandom(opts.seed);
  const recent = new Set(opts.recentArrangements.slice(0, 2));
  const candidates = ARRANGEMENTS.filter((a) => !recent.has(a));
  const pool = candidates.length ? candidates : [...ARRANGEMENTS];
  const arrangement = pool[Math.floor(rand() * pool.length)];

  const demoLen = Math.max(2, Math.min(12, opts.demo.duration_seconds ?? 6));
  const reactionLen = Math.max(1, Math.min(8, opts.reaction.duration_seconds ?? 3));

  // Reaction gets a beat, not a scene: enough to register the face, no more.
  const reactionSeconds = Math.round(Math.min(reactionLen, 1.6 + rand() * 1.6) * 10) / 10;
  const demoSeconds = Math.round(Math.min(demoLen, 4.5 + rand() * 4) * 10) / 10;

  const demoStartFrom = demoLen > demoSeconds + 1 ? Math.round(rand() * (demoLen - demoSeconds - 0.5) * 10) / 10 : 0;
  const reactionStartFrom =
    reactionLen > reactionSeconds + 0.6 ? Math.round(rand() * (reactionLen - reactionSeconds - 0.3) * 10) / 10 : 0;

  const textStyle = TEXT_STYLES[Math.floor(rand() * TEXT_STYLES.length)];
  const hookTiming = HOOK_TIMINGS[Math.floor(rand() * HOOK_TIMINGS.length)];
  const hookPlacement: HookPlacement =
    arrangement === "reaction-pip" || arrangement === "split-stack"
      ? "both"
      : HOOK_PLACEMENTS[Math.floor(rand() * HOOK_PLACEMENTS.length)];

  const totalSeconds =
    arrangement === "reaction-pip" || arrangement === "split-stack"
      ? Math.max(4, demoSeconds + 1)
      : reactionSeconds + demoSeconds;

  return {
    arrangement,
    textStyle,
    hookPlacement,
    hookTiming,
    reactionSeconds,
    demoSeconds,
    demoStartFrom,
    reactionStartFrom,
    totalSeconds: Math.round(totalSeconds * 10) / 10,
  };
}

export const ARRANGEMENT_LABELS: Record<Arrangement, string> = {
  "reaction-cut": "Reaction → demo cut",
  "reaction-pip": "Demo with reaction bubble",
  "split-stack": "Split stack (reaction + demo)",
  "demo-first": "Demo first, reaction sting",
};
