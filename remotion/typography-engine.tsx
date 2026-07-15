import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { BrandTokens, TypographyStylePlan } from "./brand";

type BeatPlan = TypographyStylePlan["beats"][number];

const CONTENT_STOP = new Set([
  "the","a","an","to","of","in","on","for","and","or","but","is","are","was","were","be","been",
  "at","by","with","as","it","this","that","you","your","we","our",
]);

// Apple-like premium easing curves. No springs — springs feel bouncy and cheap
// at this scale. Cinematic type moves with expo/quart out.
const easeOutExpo = Easing.bezier(0.16, 1, 0.3, 1);
const easeOutQuart = Easing.bezier(0.25, 1, 0.5, 1);
const easeInQuart = Easing.bezier(0.5, 0, 0.75, 0);

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
        safeMargin: clamp(plan.composition?.safeMargin ?? 108, 80, 160),
      },
      typography: {
        casing: plan.typography?.casing ?? "as-written",
        displayWeight: clamp(plan.typography?.displayWeight ?? 900, 650, 950),
        supportWeight: clamp(plan.typography?.supportWeight ?? 600, 450, 800),
        tracking: plan.typography?.tracking ?? 0,
        lineHeight: clamp(plan.typography?.lineHeight ?? 0.9, 0.82, 1.08),
      },
      beats: plan.beats.slice(0, 7).map((beat, index) => sanitizeBeat(beat, index, seed)),
    };
  }
  return buildFallbackPlan(hook, seed);
}

export function timingEngine(plan: TypographyStylePlan, totalFrames: number): ScheduledBeat[] {
  // Cinematic breathing: longer lead-in and tail so the reel doesn't feel like
  // it starts and ends mid-thought.
  const lead = 6;
  const tail = 8;
  const budget = Math.max(90, totalFrames - lead - tail);
  const weights = plan.beats.map((beat) => {
    const words = tokenize(beat.text);
    const heroWords = beat.hero.length;
    const emphasis = beat.emphasis === "hero" ? 1.35 : beat.emphasis === "strong" ? 1.15 : beat.emphasis === "quiet" ? 0.82 : 1;
    return Math.max(20, (beat.holdWeight ?? 1) * emphasis * (22 + words.length * 4.2 + heroWords * 2.6));
  });
  const total = weights.reduce((sum, next) => sum + next, 0) || 1;
  const minPerBeat = 34; // ~1.1s — enough to read + feel
  const maxPerBeat = Math.max(96, Math.round(budget / Math.max(1, plan.beats.length)) + 36);

  let cursor = lead;
  const scheduled = plan.beats.map((beat, index) => {
    const duration = clamp(Math.round((weights[index] / total) * budget), minPerBeat, maxPerBeat);
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

  // Optical centering: real designers push large type up ~2-3% of the height
  // because descenders + heavy weights make math-center feel bottom-heavy.
  const opticalShift = slot.justify === "center" ? -Math.round(height * 0.018) : 0;

  const supportGap = Math.round(tokens.heroSize * 0.32);

  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg, color: palette.fg, overflow: "hidden" }}>
      <BackgroundPrimitive beat={beat} plan={plan} palette={palette} />
      <FramingMarks beat={beat} plan={plan} palette={palette} total={plan.beats.length} />

      <div
        style={{
          position: "absolute",
          left: slot.left,
          top: slot.top + opticalShift,
          width: slot.width,
          minHeight: slot.minHeight,
          display: "flex",
          flexDirection: "column",
          justifyContent: slot.justify,
          alignItems: slot.alignItems,
          textAlign: slot.textAlign,
          gap: 0,
          opacity: motion.opacity,
          transform: `translate3d(${motion.x}px, ${motion.y}px, 0)`,
          willChange: "transform, opacity",
        }}
      >
        {tokens.supportBefore ? (
          <div style={{ marginBottom: supportGap }}>
            <SupportLine
              text={tokens.supportBefore}
              color={palette.support}
              accent={palette.accent}
              fontFamily={brand.fonts.body || brand.fonts.display}
              size={tokens.supportSize}
              weight={plan.typography?.supportWeight ?? 600}
              align={slot.textAlign}
              delay={0}
              variant="kicker"
            />
          </div>
        ) : null}

        <HeroLine
          text={tokens.hero}
          color={palette.hero}
          fontFamily={brand.fonts.display}
          size={tokens.heroSize}
          weight={plan.typography?.displayWeight ?? 900}
          lineHeight={plan.typography?.lineHeight ?? 0.9}
          align={slot.textAlign}
          tracking={tokens.heroTracking}
          delay={tokens.supportBefore ? 3 : 0}
          transition={beat.transition ?? "settle"}
        />

        {tokens.supportAfter ? (
          <div style={{ marginTop: supportGap }}>
            <SupportLine
              text={tokens.supportAfter}
              color={palette.support}
              accent={palette.accent}
              fontFamily={brand.fonts.body || brand.fonts.display}
              size={tokens.supportSize}
              weight={plan.typography?.supportWeight ?? 600}
              align={slot.textAlign}
              delay={tokens.supportBefore ? 6 : 3}
              variant="caption"
            />
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const HeroLine: React.FC<{
  text: string;
  color: string;
  fontFamily: string;
  size: number;
  weight: number;
  align: "left" | "center" | "right";
  delay: number;
  lineHeight: number;
  tracking: number;
  transition: NonNullable<BeatPlan["transition"]>;
}> = ({ text, color, fontFamily, size, weight, align, delay, lineHeight, tracking, transition }) => {
  const frame = useCurrentFrame();
  const t = Math.max(0, frame - delay);
  // Longer, more cinematic reveal. 22 frames ≈ 0.73s of anticipation.
  const enter = interpolate(t, [0, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOutExpo,
  });

  // Per-transition entry choreography — subtle, not decorative.
  const yFrom = transition === "pop" ? 8 : transition === "slide" ? 0 : 28;
  const xFrom = transition === "slide" ? -32 : 0;
  const scaleFrom = transition === "pop" ? 0.965 : 0.995;

  const y = interpolate(enter, [0, 1], [yFrom, 0]);
  const x = interpolate(enter, [0, 1], [xFrom, 0]);
  const scale = interpolate(enter, [0, 1], [scaleFrom, 1]);
  const clipPath = transition === "wipe"
    ? `inset(0 ${Math.round((1 - enter) * 100)}% 0 0)`
    : undefined;

  return (
    <div
      style={{
        width: "100%",
        color,
        fontFamily,
        fontSize: size,
        fontWeight: weight,
        lineHeight,
        letterSpacing: tracking,
        textAlign: align,
        whiteSpace: "pre-wrap",
        overflowWrap: "normal",
        fontFeatureSettings: '"ss01","liga","calt","kern"',
        textRendering: "optimizeLegibility",
        WebkitFontSmoothing: "antialiased",
        opacity: enter,
        transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
        transformOrigin: align === "left" ? "0% 50%" : align === "right" ? "100% 50%" : "50% 50%",
        clipPath,
      }}
    >
      {text}
    </div>
  );
};

const SupportLine: React.FC<{
  text: string;
  color: string;
  accent: string;
  fontFamily: string;
  size: number;
  weight: number;
  align: "left" | "center" | "right";
  delay: number;
  variant: "kicker" | "caption";
}> = ({ text, color, accent, fontFamily, size, weight, align, delay, variant }) => {
  const frame = useCurrentFrame();
  const t = Math.max(0, frame - delay);
  const enter = interpolate(t, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOutQuart,
  });
  const y = interpolate(enter, [0, 1], [10, 0]);

  // Kicker style — small caps, tracked, with a leading rule. This is what
  // editorial refs use above hero words.
  if (variant === "kicker") {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 18,
          opacity: enter * 0.92,
          transform: `translate3d(0, ${y}px, 0)`,
          justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
          width: "100%",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: Math.max(28, size * 0.9),
            height: 2,
            backgroundColor: accent,
            opacity: 0.9,
          }}
        />
        <span
          style={{
            color,
            fontFamily,
            fontSize: size,
            fontWeight: weight,
            letterSpacing: Math.max(4, size * 0.12),
            textTransform: "uppercase",
            fontFeatureSettings: '"ss01","kern","tnum"',
          }}
        >
          {text}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        color,
        fontFamily,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: 0.2,
        lineHeight: 1.28,
        textAlign: align,
        opacity: enter * 0.85,
        transform: `translate3d(0, ${y}px, 0)`,
        fontFeatureSettings: '"kern","liga"',
      }}
    >
      {text}
    </div>
  );
};

// Editorial framing marks — an index counter + a hairline rule at the bottom.
// Persistent across beats so every frame reads as a finished composition, not
// an intermediate render. Subtle, monochrome, brand-locked.
const FramingMarks: React.FC<{
  beat: ScheduledBeat;
  plan: TypographyStylePlan;
  palette: ReturnType<typeof paletteEngine>;
  total: number;
}> = ({ beat, palette, total }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOutQuart,
  });
  const num = String(beat.index + 1).padStart(2, "0");
  const totalNum = String(total).padStart(2, "0");
  const markColor = palette.fg;

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 56,
          left: 76,
          right: 76,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: markColor,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 20,
          fontWeight: 500,
          letterSpacing: 3,
          textTransform: "uppercase",
          opacity: enter * 0.55,
        }}
      >
        <span>{num} — {totalNum}</span>
        <span
          style={{
            display: "inline-block",
            width: 44,
            height: 2,
            backgroundColor: markColor,
            opacity: 0.7,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 76,
          right: 76,
          bottom: 62,
          height: 1,
          backgroundColor: markColor,
          opacity: enter * 0.22,
        }}
      />
    </>
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
      safeMargin: 108,
    },
    typography: { casing: "as-written", displayWeight: 900, supportWeight: 600, tracking: 0, lineHeight: 0.9 },
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
  const isLeftLayout = beat.layout === "split-left" || beat.layout === "upper-left" || beat.layout === "lower-left";
  const available = isLeftLayout ? width * 0.7 : width * 0.84;
  const multiLine = heroWords.length > 2 || heroText.length > 14 || beat.layout === "full-phrase";
  // Increased scale — hero should dominate the frame like a poster, not sit
  // politely on the page. Thumbnail-worthiness demands presence.
  const factor = multiLine ? 0.36 : 0.5;
  const emphasisBump = beat.emphasis === "hero" ? 1.16 : beat.emphasis === "strong" ? 1.06 : beat.emphasis === "quiet" ? 0.84 : 1;
  const heroSize = clamp(Math.floor((available / (heroChars * factor)) * emphasisBump), 108, 340);
  // Real display-type tracking: negative at huge sizes, near-zero at small.
  // This is what makes Anton/Neue Haas Display look premium instead of default.
  const heroTracking = heroSize > 220 ? -heroSize * 0.028 : heroSize > 160 ? -heroSize * 0.02 : -heroSize * 0.008;

  return {
    hero: multiLine ? smartBreak(heroText, heroWords.length > 3 ? 3 : 2) : heroText,
    supportBefore,
    supportAfter,
    heroSize,
    heroTracking,
    // Tighter hierarchy ratio. Support is a whisper, hero is a shout.
    supportSize: clamp(Math.round(heroSize * (beat.emphasis === "quiet" ? 0.22 : 0.18)), 28, 56),
  };
}

function layoutEngine(beat: BeatPlan, plan: TypographyStylePlan, width: number, height: number) {
  const margin = clamp(plan.composition?.safeMargin ?? 108, 80, 160);
  const layout = beat.layout ?? "center-stack";
  const empty = beat.emptySpace ?? "balanced";
  const textAlign = beat.align ?? (layout.includes("left") ? "left" : "center");

  const wideWidth = width - margin * 2;
  const leftWidth = width * (empty === "wide" ? 0.62 : 0.7);
  const centerTop = empty === "top-heavy" ? height * 0.4 : empty === "bottom-heavy" ? height * 0.56 : height * 0.48;

  if (layout === "upper-left") {
    return slot(margin, margin + height * 0.13, leftWidth, height * 0.5, "flex-start", "left");
  }
  if (layout === "lower-left") {
    return slot(margin, height * 0.56, leftWidth, height * 0.32, "flex-end", "left");
  }
  if (layout === "split-left") {
    return slot(margin, height * 0.22, width * 0.56, height * 0.56, "center", "left");
  }
  if (layout === "right-rail") {
    return slot(width * 0.3, height * 0.26, width * 0.6, height * 0.48, "center", "right");
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
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOutExpo,
  });
  const mode = plan.composition?.backgroundMode ?? palette.mode;

  if (mode === "split-field" || beat.layout === "split-left") {
    const w = interpolate(enter, [0, 1], [0, 32]);
    return <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${w}%`, backgroundColor: palette.accent }} />;
  }
  if (mode === "accent-band") {
    const horizontal = beat.layout === "upper-left" || beat.layout === "lower-left";
    // Thicker, more confident band. Reveals in from the edge instead of just
    // appearing.
    return (
      <div
        style={{
          position: "absolute",
          left: horizontal ? 0 : "auto",
          right: horizontal ? 0 : 88,
          bottom: horizontal ? 168 : 0,
          width: horizontal ? "100%" : 6,
          height: horizontal ? 6 : "100%",
          backgroundColor: palette.accent,
          transform: horizontal ? `scaleX(${enter})` : `scaleY(${enter})`,
          transformOrigin: horizontal ? "left center" : "center top",
        }}
      />
    );
  }
  if (mode === "framed-negative-space") {
    return (
      <div
        style={{
          position: "absolute",
          inset: 44,
          border: `2px solid ${palette.fg}`,
          opacity: enter * 0.35,
        }}
      />
    );
  }
  if (mode === "soft-panel") {
    return (
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 90,
          top: 280,
          bottom: 280,
          backgroundColor: withAlpha(palette.accent, 0.1),
          opacity: enter,
        }}
      />
    );
  }
  return null;
};

function transitionEngine(beat: BeatPlan, frame: number, _fps: number) {
  // Container-level motion is now intentionally quieter — HeroLine owns the
  // per-transition choreography. This keeps supporting text from moving
  // independently of the hero which was a big "AI-generated" tell.
  const enter = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOutExpo,
  });
  const exitStart = Math.max(12, (beat as ScheduledBeat).duration - 9);
  const exit = interpolate(frame, [exitStart, exitStart + 9], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeInQuart,
  });
  return {
    opacity: enter * (1 - exit),
    x: 0,
    // Subtle upward exit drift — cinematic, not distracting.
    y: -exit * 14,
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
