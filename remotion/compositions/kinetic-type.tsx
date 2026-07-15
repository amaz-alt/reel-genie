import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  Sequence,
} from "remotion";
import type { ReelProps } from "../brand";

/**
 * Editorial Hero — reference-grade kinetic typography.
 *
 * Design language reverse-engineered from real high-performing reels
 * (Rendy-style green editorial, YP.Motion-style black+yellow, etc.):
 *
 *  - Everything centered. Layout is intentional, never random.
 *  - One phrase per beat, structured as: [small lead] [HERO WORD] [small trail].
 *  - Hero word is huge and heavy. Support words are small and quiet.
 *  - Typography does 90% of the work: tight tracking, low leading, real weight hierarchy.
 *  - Motion is subtle: fade + small Y settle + tiny scale. No spin, shake, rotate,
 *    blur, jitter, background flashes, or per-letter effects.
 *  - Brand colours drive every pixel. Beats invert (bg↔text) deterministically
 *    to keep visual rhythm without adding animation.
 *  - Timing follows phrase weight — longer phrases hold longer.
 *  - No caption / hashtags / social copy drawn inside the frame.
 */
export const KineticType: React.FC<ReelProps> = ({ hook, brand, seed }) => {
  const { durationInFrames } = useVideoConfig();

  const beats = buildBeats(hook);
  if (beats.length === 0) {
    return <AbsoluteFill style={{ background: brand.colors.background }} />;
  }

  // Distribute frames proportional to phrase weight (word count + chars).
  const leadIn = 4;
  const tail = 6;
  const budget = Math.max(60, durationInFrames - leadIn - tail);
  const weights = beats.map((b) => {
    const wc = b.lead.length + 1 + b.trail.length;
    const cc = (b.lead.join(" ") + b.hero + b.trail.join(" ")).length;
    // Base 22f + 3f per word + 0.5f per char, clamped
    return Math.min(70, Math.max(24, 22 + wc * 3 + cc * 0.4));
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const scale = budget / total;
  const lengths = weights.map((w) => Math.floor(w * scale));

  // Deterministic accent + invert pattern per beat.
  const s = (seed ?? 1) >>> 0;
  const heroAccentIdx = beats.length > 2 ? s % beats.length : -1;

  let cursor = leadIn;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.colors.background,
        fontFamily: brand.fonts.display,
        overflow: "hidden",
      }}
    >
      {beats.map((beat, i) => {
        const len = lengths[i];
        const from = cursor;
        cursor += len;
        // Alternating invert schedule. Even beats keep brand bg; odd beats invert.
        const invert = (i + (s % 2)) % 2 === 1;
        return (
          <Sequence key={i} from={from} durationInFrames={len + 4}>
            <Beat
              lead={beat.lead}
              hero={beat.hero}
              trail={beat.trail}
              length={len}
              invert={invert}
              accent={i === heroAccentIdx}
              colors={brand.colors}
              fontFamily={brand.fonts.display}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Beat parsing                                                         */
/* ------------------------------------------------------------------ */

type ParsedBeat = { lead: string[]; hero: string; trail: string[] };

function buildBeats(hook: string): ParsedBeat[] {
  const clean = (hook ?? "").replace(/["“”]/g, "").trim();
  if (!clean) return [];

  // Split into phrases by punctuation. Each phrase = one beat.
  const phrases = clean
    .split(/[,;:.!?—–]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const beats: ParsedBeat[] = [];
  for (const phrase of phrases) {
    const words = phrase.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    // If phrase is very long, split further at natural break (~4-5 words each).
    if (words.length > 6) {
      const mid = Math.ceil(words.length / 2);
      beats.push(makeBeat(words.slice(0, mid)));
      beats.push(makeBeat(words.slice(mid)));
    } else {
      beats.push(makeBeat(words));
    }
  }
  return beats;
}

const STOP = new Set([
  "the", "a", "an", "to", "of", "in", "on", "for", "and", "or", "but",
  "is", "are", "was", "were", "be", "been", "being", "at", "by", "with",
  "as", "it", "its", "this", "that", "these", "those", "you", "your",
  "i", "me", "my", "we", "our", "us", "they", "them", "their",
]);

function makeBeat(words: string[]): ParsedBeat {
  if (words.length === 1) {
    return { lead: [], hero: words[0], trail: [] };
  }
  // Score words: prefer content words with more characters, and prefer later words.
  let bestIdx = 0;
  let bestScore = -Infinity;
  words.forEach((w, i) => {
    const bare = w.toLowerCase().replace(/[^a-z0-9]/g, "");
    const isStop = STOP.has(bare);
    const score = (isStop ? -5 : bare.length) + i * 0.15;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });
  return {
    lead: words.slice(0, bestIdx),
    hero: words[bestIdx],
    trail: words.slice(bestIdx + 1),
  };
}

/* ------------------------------------------------------------------ */
/* Beat renderer                                                        */
/* ------------------------------------------------------------------ */

const Beat: React.FC<{
  lead: string[];
  hero: string;
  trail: string[];
  length: number;
  invert: boolean;
  accent: boolean;
  colors: { primary: string; accent: string; background: string; text: string };
  fontFamily: string;
}> = ({ lead, hero, trail, length, invert, accent, colors, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const bg = invert ? colors.text : colors.background;
  const fg = invert ? colors.background : colors.text;
  const heroColor = accent ? colors.accent : fg;

  // Enter: fade + tiny slide + tiny scale. Spring, no overshoot.
  const enter = spring({
    frame,
    fps,
    config: { damping: 28, stiffness: 140, mass: 0.7 },
  });
  const heroEnter = spring({
    frame: frame - 1,
    fps,
    config: { damping: 26, stiffness: 130, mass: 0.75 },
  });
  const trailEnter = spring({
    frame: frame - 2,
    fps,
    config: { damping: 28, stiffness: 140, mass: 0.7 },
  });

  // Exit: last ~6 frames.
  const exitStart = length - 6;
  const exit = interpolate(frame, [exitStart, exitStart + 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const globalOpacity = 1 - exit;
  const globalY = -exit * 12;

  // Hero size auto-fits width. Safe margin 8%.
  const safe = width * 0.84;
  const heroLen = hero.length;
  // Rough per-glyph width factor for a black/heavy display font at size=1.
  const heroSize = Math.min(320, Math.floor(safe / (heroLen * 0.55)));
  const supportSize = Math.round(heroSize * 0.28);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bg,
        color: fg,
      }}
    >
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: "0 80px",
          transform: `translateY(${globalY}px)`,
          opacity: globalOpacity,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: Math.round(heroSize * 0.02),
            width: "100%",
          }}
        >
          {lead.length > 0 && (
            <SupportLine
              text={lead.join(" ")}
              size={supportSize}
              enter={enter}
              color={fg}
              fontFamily={fontFamily}
              weight={600}
            />
          )}

          <HeroLine
            text={hero}
            size={heroSize}
            enter={heroEnter}
            color={heroColor}
            fontFamily={fontFamily}
          />

          {trail.length > 0 && (
            <SupportLine
              text={trail.join(" ")}
              size={supportSize}
              enter={trailEnter}
              color={fg}
              fontFamily={fontFamily}
              weight={600}
            />
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const HeroLine: React.FC<{
  text: string;
  size: number;
  enter: number;
  color: string;
  fontFamily: string;
}> = ({ text, size, enter, color, fontFamily }) => {
  const opacity = enter;
  const y = interpolate(enter, [0, 1], [24, 0]);
  const scale = interpolate(enter, [0, 1], [0.94, 1]);
  return (
    <div
      style={{
        fontFamily,
        fontSize: size,
        fontWeight: 900,
        lineHeight: 0.92,
        letterSpacing: -Math.max(2, size * 0.02),
        color,
        textAlign: "center",
        opacity,
        transform: `translateY(${y}px) scale(${scale})`,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
};

const SupportLine: React.FC<{
  text: string;
  size: number;
  enter: number;
  color: string;
  fontFamily: string;
  weight: number;
}> = ({ text, size, enter, color, fontFamily, weight }) => {
  const opacity = enter * 0.9;
  const y = interpolate(enter, [0, 1], [14, 0]);
  return (
    <div
      style={{
        fontFamily,
        fontSize: size,
        fontWeight: weight,
        lineHeight: 1.05,
        letterSpacing: 0,
        color,
        textAlign: "center",
        opacity,
        transform: `translateY(${y}px)`,
        maxWidth: "100%",
      }}
    >
      {text}
    </div>
  );
};
