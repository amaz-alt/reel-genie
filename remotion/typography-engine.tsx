import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { BrandTokens, TypographyStylePlan } from "./brand";

type BeatPlan = TypographyStylePlan["beats"][number];

const CONTENT_STOP = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "for",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "at",
  "by",
  "with",
  "as",
  "it",
  "this",
  "that",
  "you",
  "your",
  "we",
  "our",
]);

export type ScheduledBeat = BeatPlan & {
  from: number;
  duration: number;
  index: number;
};

export function normalizePlan(hook: string, seed = 1, plan?: TypographyStylePlan): TypographyStylePlan {
  if (plan?.version === "primitive-typography-v1" && Array.isArray(plan.beats) && plan.beats.length) {
    return {
      version: "primitive-typography-v1",
      composition: {
        canvasMood: plan.composition?.canvasMood ?? "editorial",
        backgroundMode: plan.composition?.backgroundMode ?? "solid",
        safeMargin: clamp(plan.composition?.safeMargin ?? 90, 64, 140),
      },
      typography: {
        casing: plan.typography?.casing ?? "as-written",
        displayWeight: clamp(plan.typography?.displayWeight ?? 900, 650, 950),
        supportWeight: clamp(plan.typography?.supportWeight ?? 650, 450, 800),
        tracking: Math.max(0, plan.typography?.tracking ?? 0),
        lineHeight: clamp(plan.typography?.lineHeight ?? 0.94, 0.86, 1.12),
      },
      beats: plan.beats.slice(0, 7).map((beat, index) => sanitizeBeat(beat, index, seed)),
    };
  }

  return buildFallbackPlan(hook, seed);
}

export function timingEngine(plan: TypographyStylePlan, totalFrames: number): ScheduledBeat[] {
  const lead = 3;
  const tail = 4;
  const budget = Math.max(90, totalFrames - lead - tail);
  const weights = plan.beats.map((beat) => {
    const words = tokenize(beat.text);
    const heroWords = beat.hero.length;
    const emphasis = beat.emphasis === "hero" ? 1.28 : beat.emphasis === "strong" ? 1.12 : beat.emphasis === "quiet" ? 0.88 : 1;
    return Math.max(18, (beat.holdWeight ?? 1) * emphasis * (20 + words.length * 3.8 + heroWords * 2.4));
  });
  const total = weights.reduce((sum, next) => sum + next, 0) || 1;
  // Minimum readable hold ≈ 0.9s at 30fps. Cap generously so long reels
  // actually breathe instead of clipping every beat to <2s.
  const minPerBeat = 28;
  const maxPerBeat = Math.max(90, Math.round(budget / Math.max(1, plan.beats.length)) + 30);

  let cursor = lead;
  const scheduled = plan.beats.map((beat, index) => {
    const duration = clamp(Math.round((weights[index] / total) * budget), minPerBeat, maxPerBeat);
    const out = { ...beat, from: cursor, duration, index };
    cursor += duration;
    return out;
  });

  let cursor = lead;
  const scheduled = plan.beats.map((beat, index) => {
    const duration = clamp(Math.round((weights[index] / total) * budget), 24, 58);
    const out = { ...beat, from: cursor, duration, index };
    cursor += duration;
    return out;
  });

  const used = cursor + tail;
  if (used < totalFrames && scheduled.length) {
    scheduled[scheduled.length - 1].duration += totalFrames - used;
  }
  return scheduled;
}

export const PrimitiveBeat: React.FC<{
  beat: ScheduledBeat;
  plan: TypographyStylePlan;
  brand: BrandTokens;
}> = ({ beat, plan, brand }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const tokens = typographyEngine(beat, plan, width);
  const palette = paletteEngine(beat, plan, brand);
  const slot = layoutEngine(beat, plan, width, height);
  const motion = transitionEngine(beat, frame, fps);

  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg, color: palette.fg, overflow: "hidden" }}>
      <BackgroundPrimitive beat={beat} plan={plan} palette={palette} />
      <div
        style={{
          position: "absolute",
          left: slot.left,
          top: slot.top,
          width: slot.width,
          minHeight: slot.minHeight,
          display: "flex",
          flexDirection: "column",
          justifyContent: slot.justify,
          alignItems: slot.alignItems,
          textAlign: slot.textAlign,
          opacity: motion.opacity,
          transform: `translate(${motion.x}px, ${motion.y}px) scale(${motion.scale})`,
          clipPath: motion.clipPath,
        }}
      >
        {tokens.supportBefore ? (
          <TextLine
            text={tokens.supportBefore}
            kind="support"
            color={palette.support}
            fontFamily={brand.fonts.body || brand.fonts.display}
            size={tokens.supportSize}
            weight={plan.typography?.supportWeight ?? 650}
            align={slot.textAlign}
            delay={0}
          />
        ) : null}

        <TextLine
          text={tokens.hero}
          kind="hero"
          color={palette.hero}
          fontFamily={brand.fonts.display}
          size={tokens.heroSize}
          weight={plan.typography?.displayWeight ?? 900}
          lineHeight={plan.typography?.lineHeight ?? 0.94}
          align={slot.textAlign}
          tracking={plan.typography?.tracking ?? 0}
          delay={tokens.supportBefore ? 2 : 0}
        />

        {tokens.supportAfter ? (
          <TextLine
            text={tokens.supportAfter}
            kind="support"
            color={palette.support}
            fontFamily={brand.fonts.body || brand.fonts.display}
            size={tokens.supportSize}
            weight={plan.typography?.supportWeight ?? 650}
            align={slot.textAlign}
            delay={tokens.supportBefore ? 4 : 2}
          />
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const TextLine: React.FC<{
  text: string;
  kind: "hero" | "support";
  color: string;
  fontFamily: string;
  size: number;
  weight: number;
  align: "left" | "center" | "right";
  delay: number;
  lineHeight?: number;
  tracking?: number;
}> = ({ text, kind, color, fontFamily, size, weight, align, delay, lineHeight = 1, tracking = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame - delay,
    fps,
    config: { damping: kind === "hero" ? 22 : 28, stiffness: kind === "hero" ? 170 : 130, mass: 0.72 },
  });
  const y = interpolate(enter, [0, 1], [kind === "hero" ? 18 : 10, 0]);
  const scale = interpolate(enter, [0, 1], [kind === "hero" ? 0.965 : 0.99, 1]);

  return (
    <div
      style={{
        width: "100%",
        color,
        fontFamily,
        fontSize: size,
        fontWeight: weight,
        lineHeight,
        letterSpacing: Math.max(0, tracking),
        textAlign: align,
        whiteSpace: "pre-wrap",
        overflowWrap: "normal",
        opacity: clamp(enter, 0, kind === "hero" ? 1 : 0.92),
        transform: `translateY(${y}px) scale(${scale})`,
        transformOrigin: align === "left" ? "left center" : align === "right" ? "right center" : "center center",
      }}
    >
      {text}
    </div>
  );
};

function buildFallbackPlan(hook: string, seed: number): TypographyStylePlan {
  const phrases = splitHook(hook);
  const layouts: NonNullable<BeatPlan["layout"]>[] = ["center-stack", "upper-left", "poster-block", "lower-left", "split-left"];
  const offset = seed % layouts.length;
  return {
    version: "primitive-typography-v1",
    composition: {
      canvasMood: seed % 3 === 0 ? "minimal" : seed % 3 === 1 ? "editorial" : "bold-poster",
      backgroundMode: seed % 4 === 0 ? "accent-band" : seed % 4 === 1 ? "framed-negative-space" : "solid",
      safeMargin: 90,
    },
    typography: { casing: "as-written", displayWeight: 900, supportWeight: 650, tracking: 0, lineHeight: 0.94 },
    beats: phrases.map((phrase, index) => {
      const words = tokenize(phrase);
      const hero = chooseHero(words);
      const heroStart = words.findIndex((word) => clean(word) === clean(hero[0]));
      const heroEnd = heroStart + hero.length;
      return sanitizeBeat(
        {
          text: phrase,
          hero,
          supportBefore: words.slice(0, Math.max(0, heroStart)).join(" "),
          supportAfter: words.slice(heroEnd).join(" "),
          emphasis: index === 0 ? "strong" : hero.length > 1 ? "hero" : "normal",
          layout: layouts[(offset + index) % layouts.length],
          align: layouts[(offset + index) % layouts.length].includes("left") ? "left" : "center",
          holdWeight: 1 + words.length * 0.06,
          colorRole: index % 3 === 1 ? "invert" : index % 3 === 2 ? "accent-bg" : "base",
          emptySpace: index % 2 === 0 ? "balanced" : "wide",
          transition: index % 4 === 0 ? "pop" : index % 4 === 1 ? "settle" : index % 4 === 2 ? "wipe" : "slide",
        },
        index,
        seed,
      );
    }),
  };
}

function sanitizeBeat(beat: BeatPlan, index: number, seed: number): BeatPlan {
  const text = String(beat.text ?? "").replace(/\s+/g, " ").trim() || "Your message here";
  const words = tokenize(text);
  const hero = Array.isArray(beat.hero) && beat.hero.length ? beat.hero.map(String).filter(Boolean) : chooseHero(words);
  const layout = beat.layout ?? (["center-stack", "upper-left", "poster-block", "lower-left"] as const)[(seed + index) % 4];
  const align = beat.align ?? (layout.includes("left") ? "left" : layout === "right-rail" ? "right" : "center");
  return {
    text,
    hero: hero.length ? hero.slice(0, 5) : words.slice(0, 1),
    supportBefore: String(beat.supportBefore ?? "").trim(),
    supportAfter: String(beat.supportAfter ?? "").trim(),
    emphasis: beat.emphasis ?? "normal",
    layout,
    align,
    holdWeight: clamp(beat.holdWeight ?? 1, 0.65, 1.8),
    colorRole: beat.colorRole ?? (index % 2 ? "invert" : "base"),
    emptySpace: beat.emptySpace ?? "balanced",
    transition: beat.transition ?? "settle",
  };
}

function typographyEngine(beat: BeatPlan, plan: TypographyStylePlan, width: number) {
  const words = tokenize(beat.text);
  const heroWords = beat.hero.length ? beat.hero : chooseHero(words);
  const heroText = applyCasing(heroWords.join(" "), plan.typography?.casing ?? "as-written");
  const hasManualSupport = Boolean(beat.supportBefore || beat.supportAfter);
  const before = hasManualSupport ? beat.supportBefore ?? "" : wordsBefore(words, heroWords).join(" ");
  const after = hasManualSupport ? beat.supportAfter ?? "" : wordsAfter(words, heroWords).join(" ");
  const supportBefore = applyCasing(before, plan.typography?.casing ?? "as-written");
  const supportAfter = applyCasing(after, plan.typography?.casing ?? "as-written");
  const heroChars = Math.max(2, heroText.length);
  const available = (beat.layout === "split-left" || beat.layout === "upper-left" || beat.layout === "lower-left") ? width * 0.72 : width * 0.82;
  const multiLine = heroWords.length > 2 || heroText.length > 15 || beat.layout === "full-phrase";
  const factor = multiLine ? 0.34 : 0.53;
  const emphasisBump = beat.emphasis === "hero" ? 1.12 : beat.emphasis === "strong" ? 1.04 : beat.emphasis === "quiet" ? 0.86 : 1;
  const heroSize = clamp(Math.floor((available / (heroChars * factor)) * emphasisBump), 96, 310);
  return {
    hero: multiLine ? smartBreak(heroText, heroWords.length > 3 ? 3 : 2) : heroText,
    supportBefore,
    supportAfter,
    heroSize,
    supportSize: clamp(Math.round(heroSize * (beat.emphasis === "quiet" ? 0.34 : 0.28)), 34, 82),
  };
}

function layoutEngine(beat: BeatPlan, plan: TypographyStylePlan, width: number, height: number) {
  const margin = clamp(plan.composition?.safeMargin ?? 90, 64, 140);
  const layout = beat.layout ?? "center-stack";
  const empty = beat.emptySpace ?? "balanced";
  const textAlign = beat.align ?? (layout.includes("left") ? "left" : "center");

  const wideWidth = width - margin * 2;
  const leftWidth = width * (empty === "wide" ? 0.66 : 0.72);
  const centerTop = empty === "top-heavy" ? height * 0.42 : empty === "bottom-heavy" ? height * 0.53 : height * 0.47;

  if (layout === "upper-left") {
    return slot(margin, margin + height * 0.11, leftWidth, height * 0.54, "flex-start", "left");
  }
  if (layout === "lower-left") {
    return slot(margin, height * 0.55, leftWidth, height * 0.34, "flex-end", "left");
  }
  if (layout === "split-left") {
    return slot(margin, height * 0.2, width * 0.58, height * 0.6, "center", "left");
  }
  if (layout === "right-rail") {
    return slot(width * 0.28, height * 0.24, width * 0.62, height * 0.52, "center", "right");
  }
  if (layout === "poster-block") {
    return slot(margin, centerTop - height * 0.22, wideWidth, height * 0.44, "center", textAlign);
  }
  if (layout === "full-phrase") {
    return slot(margin, height * 0.3, wideWidth, height * 0.4, "center", textAlign);
  }
  return slot(margin, centerTop - height * 0.2, wideWidth, height * 0.4, "center", "center");
}

function slot(
  left: number,
  top: number,
  width: number,
  minHeight: number,
  justify: "center" | "flex-start" | "flex-end",
  textAlign: "left" | "center" | "right",
) {
  return {
    left,
    top,
    width,
    minHeight,
    justify,
    textAlign,
    alignItems: textAlign === "left" ? "flex-start" : textAlign === "right" ? "flex-end" : "center",
  };
}

function paletteEngine(beat: BeatPlan, plan: TypographyStylePlan, brand: BrandTokens) {
  const role = beat.colorRole ?? "base";
  const mode = plan.composition?.backgroundMode ?? "solid";
  const base = {
    bg: brand.colors.background,
    fg: brand.colors.text,
    hero: role === "base" && beat.emphasis === "hero" ? brand.colors.primary : brand.colors.text,
    support: brand.colors.text,
    accent: brand.colors.accent,
    mode,
  };
  if (role === "invert") {
    return { ...base, bg: brand.colors.text, fg: brand.colors.background, hero: brand.colors.background, support: brand.colors.background };
  }
  if (role === "accent-bg") {
    return { ...base, bg: brand.colors.accent, fg: brand.colors.background, hero: brand.colors.background, support: brand.colors.background };
  }
  if (role === "primary-bg") {
    return { ...base, bg: brand.colors.primary, fg: brand.colors.background, hero: brand.colors.background, support: brand.colors.background };
  }
  return base;
}

const BackgroundPrimitive: React.FC<{
  beat: BeatPlan;
  plan: TypographyStylePlan;
  palette: ReturnType<typeof paletteEngine>;
}> = ({ beat, plan, palette }) => {
  const mode = plan.composition?.backgroundMode ?? palette.mode;
  if (mode === "split-field" || beat.layout === "split-left") {
    return <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "30%", backgroundColor: palette.accent }} />;
  }
  if (mode === "accent-band") {
    const horizontal = beat.layout === "upper-left" || beat.layout === "lower-left";
    return (
      <div
        style={{
          position: "absolute",
          left: horizontal ? 0 : "auto",
          right: horizontal ? 0 : 76,
          bottom: horizontal ? 140 : 0,
          width: horizontal ? "100%" : 34,
          height: horizontal ? 34 : "100%",
          backgroundColor: palette.accent,
        }}
      />
    );
  }
  if (mode === "framed-negative-space") {
    return <div style={{ position: "absolute", inset: 44, border: `8px solid ${palette.accent}`, opacity: 0.92 }} />;
  }
  if (mode === "soft-panel") {
    return <div style={{ position: "absolute", left: 70, right: 70, top: 260, bottom: 260, backgroundColor: withAlpha(palette.accent, 0.12) }} />;
  }
  return null;
};

function transitionEngine(beat: BeatPlan, frame: number, fps: number) {
  const enter = spring({ frame, fps, config: { damping: 24, stiffness: 150, mass: 0.72 } });
  const exitStart = Math.max(10, (beat as ScheduledBeat).duration - 7);
  const exit = interpolate(frame, [exitStart, exitStart + 7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const transition = beat.transition ?? "settle";
  const baseY = transition === "pop" ? interpolate(enter, [0, 1], [12, 0]) : interpolate(enter, [0, 1], [24, 0]);
  const baseX = transition === "slide" ? interpolate(enter, [0, 1], [-28, 0]) : 0;
  const scale = transition === "pop" ? interpolate(enter, [0, 1], [0.94, 1]) : interpolate(enter, [0, 1], [0.985, 1]);
  const clipPath = transition === "wipe" ? `inset(0 ${Math.round((1 - enter) * 100)}% 0 0)` : undefined;
  return {
    opacity: clamp(enter, 0, 1) * (1 - exit),
    x: baseX,
    y: baseY - exit * 12,
    scale,
    clipPath,
  };
}

function splitHook(hook: string) {
  const cleanHook = String(hook ?? "").replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
  const phrases = cleanHook
    .split(/[,;:.!?—–]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const source = phrases.length ? phrases : [cleanHook || "Your hook goes here"];
  const out: string[] = [];
  for (const phrase of source) {
    const words = tokenize(phrase);
    if (words.length <= 5) out.push(phrase);
    else if (words.length <= 9) {
      const mid = Math.ceil(words.length / 2);
      out.push(words.slice(0, mid).join(" "), words.slice(mid).join(" "));
    } else {
      for (let i = 0; i < words.length; i += 4) out.push(words.slice(i, i + 4).join(" "));
    }
  }
  return out.slice(0, 7);
}

function tokenize(text: string) {
  return String(text ?? "").split(/\s+/).map((w) => w.trim()).filter(Boolean);
}

function chooseHero(words: string[]) {
  if (words.length <= 2) return words;
  const scored = words.map((word, index) => {
    const bare = clean(word);
    const score = (CONTENT_STOP.has(bare) ? -4 : bare.length) + index * 0.18 + (/\d/.test(bare) ? 3 : 0);
    return { word, index, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const first = scored[0];
  const next = words[first.index + 1];
  if (next && clean(next).length >= 4 && !CONTENT_STOP.has(clean(next)) && words.length > 4) return [first.word, next];
  return [first.word];
}

function wordsBefore(words: string[], hero: string[]) {
  const start = findHeroStart(words, hero);
  return start < 0 ? [] : words.slice(0, start);
}

function wordsAfter(words: string[], hero: string[]) {
  const start = findHeroStart(words, hero);
  return start < 0 ? [] : words.slice(start + hero.length);
}

function findHeroStart(words: string[], hero: string[]) {
  if (!hero.length) return -1;
  for (let i = 0; i <= words.length - hero.length; i++) {
    const ok = hero.every((h, j) => clean(words[i + j]) === clean(h));
    if (ok) return i;
  }
  return words.findIndex((word) => clean(word) === clean(hero[0]));
}

function smartBreak(text: string, maxWordsPerLine: number) {
  const words = tokenize(text);
  if (words.length <= maxWordsPerLine) return text;
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += maxWordsPerLine) lines.push(words.slice(i, i + maxWordsPerLine).join(" "));
  return lines.join("\n");
}

function applyCasing(text: string, casing: NonNullable<TypographyStylePlan["typography"]>["casing"]) {
  if (!text) return "";
  if (casing === "uppercase") return text.toUpperCase();
  if (casing === "title") return text.replace(/\b\w/g, (m) => m.toUpperCase());
  return text;
}

function clean(word: string) {
  return String(word ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function withAlpha(hex: string, alpha: number) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}