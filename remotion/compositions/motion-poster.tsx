import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { scriptFromHook, useGoogleFont, type Beat, type ReelProps } from "../brand";

/**
 * MOTION POSTER — reverse-engineered from the yp.motionstudio reference reel.
 *
 * Locked design language (do NOT reinterpret):
 *  - Full-bleed background alternates PRIMARY ↔ ACCENT per beat. Hard cut.
 *  - Foreground is ALWAYS the opposite color for maximum contrast.
 *  - Two layout modes only:
 *      • "single" — one word/phrase centered, hero size, huge.
 *      • "stack"  — 2-3 lines with dramatic size contrast (small / HUGE / small).
 *  - Watermark: outlined Instagram square glyph + "@handle" tiny, top-center.
 *  - Entrance: 3-frame fade + 12px settle. No spin, no shake, no bounce.
 *  - Font: brand.fonts.display, weight 900. Tight tracking (-4%).
 */

function fitHeroSize(text: string) {
  const clean = text.replace(/[^\p{L}\p{N} ']/gu, "");
  const longest = Math.max(3, ...clean.split(/\s+/).map((w) => w.length));
  const wordCount = clean.split(/\s+/).length;
  // Longer words / more words → smaller. Single short word → HUGE.
  const base = 1650 / longest;
  const density = wordCount > 1 ? 0.78 : 1;
  return Math.max(150, Math.min(430, base * density));
}

function normalizeHandle(name?: string | null) {
  if (!name) return "";
  const cleaned = name.startsWith("@") ? name.slice(1) : name;
  return `@${cleaned.toLowerCase().replace(/[^a-z0-9._]+/g, "")}`.slice(0, 28);
}

// Simple 3-frame fade + 12px settle, matching the "just appears" feel of the ref.
// Sequence-local frame — inside a <Sequence>, useCurrentFrame() already
// returns frames relative to the sequence start, so we do NOT subtract
// startFrame (that made every beat after the first render as blank).
function useBeatEntrance() {
  const local = useCurrentFrame();
  const opacity = interpolate(local, [0, 3], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(local, [0, 6], [12, 0], { extrapolateRight: "clamp" });
  return { opacity, transform: `translateY(${y}px)` };
}

const IGIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 22 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ verticalAlign: "middle" }}
  >
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="0.6" fill={color} />
  </svg>
);

const Watermark: React.FC<{ handle: string; color: string }> = ({ handle, color }) => {
  if (!handle) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 90,
        left: 0,
        right: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color,
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: 2,
        opacity: 0.92,
        textTransform: "uppercase",
      }}
    >
      <IGIcon color={color} />
      <span>{handle}</span>
    </div>
  );
};

const SingleBeat: React.FC<{
  beat: Beat;
  bg: string;
  fg: string;
  startFrame: number;
  fontFamily: string;
  handle: string;
}> = ({ beat, bg, fg, startFrame, fontFamily, handle }) => {
  const entrance = useBeatEntrance();
  const line = beat.lines[0];
  const size = fitHeroSize(line.text);
  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <Watermark handle={handle} color={fg} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 70px" }}>
        <div
          style={{
            fontFamily,
            color: fg,
            fontWeight: 900,
            fontSize: size,
            letterSpacing: `${-size * 0.045}px`,
            lineHeight: 0.94,
            textAlign: "center",
            transform: `${entrance.transform} translateY(-1.6%)`,
            opacity: entrance.opacity,
          }}
        >
          {line.text}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const StackBeat: React.FC<{
  beat: Beat;
  bg: string;
  fg: string;
  startFrame: number;
  fontFamily: string;
  handle: string;
}> = ({ beat, bg, fg, startFrame, fontFamily, handle }) => {
  const entrance = useBeatEntrance();
  // Compute hero size against the longest hero line only.
  const heroLine = beat.lines.find((l) => l.size === "hero")?.text ?? beat.lines[0].text;
  const heroSize = fitHeroSize(heroLine);
  const smallSize = Math.max(46, Math.round(heroSize * 0.22));
  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <Watermark handle={handle} color={fg} />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          padding: "0 70px",
          flexDirection: "column",
          gap: Math.round(heroSize * 0.02),
        }}
      >
        <div
          style={{
            fontFamily,
            color: fg,
            opacity: entrance.opacity,
            transform: `${entrance.transform} translateY(-1.6%)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: Math.round(heroSize * 0.02),
          }}
        >
          {beat.lines.map((l, i) => {
            const isHero = l.size === "hero";
            const sz = isHero ? heroSize : smallSize;
            return (
              <div
                key={i}
                style={{
                  fontWeight: isHero ? 900 : 700,
                  fontSize: sz,
                  letterSpacing: `${-sz * (isHero ? 0.045 : 0.02)}px`,
                  lineHeight: 0.94,
                }}
              >
                {l.text}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const MotionPoster: React.FC<ReelProps> = ({ hook, script, brand, handle: handleProp }) => {
  const { durationInFrames } = useVideoConfig();
  useGoogleFont(brand.fonts.display || "Poppins");

  const beats: Beat[] = script && script.length ? script : scriptFromHook(hook);
  const bgA = brand.colors.accent || "#F5E63B"; // yellow-equivalent
  const bgB = brand.colors.primary || "#0a0a0a"; // black-equivalent
  const handle = normalizeHandle(handleProp);

  // Distribute frames respecting per-beat `hold` weights.
  const weights = beats.map((b) => Math.max(0.6, b.hold ?? 1));
  const totalW = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  const spans = weights.map((w) => {
    const frames = Math.max(15, Math.round((w / totalW) * durationInFrames));
    const from = cursor;
    cursor += frames;
    return { from, frames };
  });

  const fontFamily = `'${brand.fonts.display || "Poppins"}', 'Helvetica Neue', Arial, sans-serif`;

  return (
    <AbsoluteFill style={{ backgroundColor: bgB, fontFamily }}>
      {beats.map((beat, i) => {
        const isA = i % 2 === 0;
        const bg = isA ? bgA : bgB;
        const fg = isA ? bgB : bgA;
        const { from, frames } = spans[i];
        return (
          <Sequence key={i} from={from} durationInFrames={frames} layout="none">
            {beat.layout === "stack" ? (
              <StackBeat beat={beat} bg={bg} fg={fg} startFrame={from} fontFamily={fontFamily} handle={handle} />
            ) : (
              <SingleBeat beat={beat} bg={bg} fg={fg} startFrame={from} fontFamily={fontFamily} handle={handle} />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
