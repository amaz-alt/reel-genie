export type BrandTokens = {
  colors: { primary: string; accent: string; background: string; text: string };
  fonts: { display: string; body: string };
  logoUrl?: string | null;
};

export type TypographyStylePlan = {
  version: "primitive-typography-v1";
  composition?: {
    canvasMood?: "editorial" | "bold-poster" | "minimal" | "saas-clean" | "creator-caption";
    backgroundMode?: "solid" | "split-field" | "framed-negative-space" | "accent-band" | "soft-panel";
    safeMargin?: number;
  };
  typography?: {
    casing?: "as-written" | "uppercase" | "title";
    displayWeight?: number;
    supportWeight?: number;
    tracking?: number;
    lineHeight?: number;
  };
  beats: Array<{
    text: string;
    hero: string[];
    supportBefore?: string;
    supportAfter?: string;
    emphasis?: "quiet" | "normal" | "strong" | "hero";
    layout?: "center-stack" | "upper-left" | "lower-left" | "split-left" | "right-rail" | "full-phrase" | "poster-block";
    align?: "center" | "left" | "right";
    holdWeight?: number;
    colorRole?: "base" | "invert" | "accent-bg" | "primary-bg";
    emptySpace?: "balanced" | "top-heavy" | "bottom-heavy" | "wide";
    transition?: "settle" | "pop" | "wipe" | "cut" | "slide";
  }>;
};

export type ReelProps = {
  hook: string;
  caption?: string;
  brand: BrandTokens;
  /** Brand handle rendered as watermark, e.g. "@brandname". */
  handle?: string | null;
  product?: Record<string, unknown>;
  /** Deterministic PRNG seed — different value = different motion instance. */
  seed?: number;
  /** Named motion variant. If omitted, chosen from seed. */
  variant?: "stagger" | "cascade" | "bounce" | "mask" | "shuffle" | "swing";
  /** AI-authored design primitive plan. */
  stylePlan?: TypographyStylePlan;
};

export const DEFAULT_BRAND: BrandTokens = {
  colors: { primary: "#0a0a0a", accent: "#ff3b30", background: "#f5f1ea", text: "#0a0a0a" },
  fonts: { display: "Space Grotesk", body: "Inter" },
  logoUrl: null,
};

/** Cheap deterministic PRNG (mulberry32) — same seed = same reel. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const VARIANTS = ["stagger", "cascade", "bounce", "mask", "shuffle", "swing"] as const;
