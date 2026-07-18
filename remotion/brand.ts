import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";

export type BrandTokens = {
  colors: { primary: string; accent: string; background: string; text: string };
  fonts: { display: string; body: string };
  logoUrl?: string | null;
};

/**
 * A "beat" is one on-screen moment. Two layouts, matching the references:
 *
 *  - "single": one line, centered, hero-sized. e.g. "brands", "goals".
 *  - "stack":  2-3 lines with mixed sizes for dramatic hierarchy. e.g.
 *              [ "the", size:small ] / [ "truth is", size:hero ]
 *              [ "don't", small ] / [ "NEED", hero ] / [ "content.", small ]
 *
 * `hold` is duration in frames. Default cadence is ~24-30 frames (0.8-1.0s).
 */
export type BeatLine = { text: string; size: "small" | "hero" };
export type Beat = {
  layout: "single" | "stack";
  lines: BeatLine[];
  hold?: number;
};

export type ReelProps = {
  hook: string;
  script?: Beat[];
  caption?: string;
  brand: BrandTokens;
  handle?: string | null;
  product?: Record<string, unknown>;
  seed?: number;
  /** Legacy fields — kept so older jobs still render. */
  variant?: string;
  stylePlan?: unknown;
  qualityPlan?: unknown;
};

export const DEFAULT_BRAND: BrandTokens = {
  colors: { primary: "#0a0a0a", accent: "#F5E63B", background: "#f5f1ea", text: "#0a0a0a" },
  fonts: { display: "Poppins", body: "Inter" },
  logoUrl: null,
};

/**
 * Load a Google Font at composition boot. We block Remotion's render until
 * the font is available so headings don't fall back to system fonts on the
 * first frame.
 */
export function useGoogleFont(family: string, weights: number[] = [400, 700, 800, 900]) {
  const [handle] = useState(() => delayRender(`font:${family}`));
  useEffect(() => {
    const fam = family.trim().replace(/\s+/g, "+");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${fam}:wght@${weights.join(";")}&display=swap`;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      // Wait for the browser to actually parse the font faces.
      (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready
        ?.then(() => continueRender(handle))
        .catch(() => continueRender(handle));
    };
    link.onload = finish;
    link.onerror = finish;
    document.head.appendChild(link);
    // Safety net: never hang forever.
    const t = setTimeout(finish, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Fallback script when the copywriter didn't emit one — split the hook on punctuation. */
export function scriptFromHook(hook: string): Beat[] {
  const parts = hook
    .replace(/[""'']/g, "")
    .split(/[,;:.!?—–]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const source = parts.length ? parts : [hook];
  return source.slice(0, 12).map<Beat>((phrase) => {
    const words = phrase.split(/\s+/).filter(Boolean);
    if (words.length <= 1) return { layout: "single", lines: [{ text: phrase, size: "hero" }] };
    if (words.length <= 2) return { layout: "single", lines: [{ text: phrase, size: "hero" }] };
    // Long: split into small kicker + hero remainder
    const kicker = words.slice(0, Math.max(1, Math.floor(words.length / 3))).join(" ");
    const hero = words.slice(Math.max(1, Math.floor(words.length / 3))).join(" ");
    return {
      layout: "stack",
      lines: [
        { text: kicker, size: "small" },
        { text: hero, size: "hero" },
      ],
    };
  });
}
