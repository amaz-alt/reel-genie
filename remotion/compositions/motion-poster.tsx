import { AbsoluteFill, Audio, Easing, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { computeSpans, scriptFromHook, useGoogleFont, type Beat, type ReelProps } from "../brand";

/**
 * MOTION POSTER — reverse-engineered from the yp.motionstudio reference reel.
 *
 * Locked design language (do NOT reinterpret):
 *  - Full-bleed background alternates PRIMARY ↔ ACCENT per beat. ~2-frame
 *    crossfade between beats (subtle, imperceptible — not a design change,
 *    just prevents the "digital hard-cut" feel).
 *  - Foreground is ALWAYS the opposite color for maximum contrast.
 *  - Two layout modes only: "single" or "stack".
 *  - Watermark: outlined Instagram square glyph + "@handle" tiny, top-center.
 *  - Font: brand.fonts.display, weight 900.
 *
 * Animation FEEL (this file is the only place to touch for feel changes):
 *  - Entrance easing: cubic-bezier(0.22, 1, 0.36, 1) — Apple-style out-quart.
 *  - Entrance duration scales with the beat's hold weight (heavier beats
 *    enter more deliberately, lighter beats snap in). 4–8 frames.
 *  - Text exit begins 5 frames before the beat ends: 3px lift + fade to 0.
 *  - Background crossfade window: 3 frames on the incoming beat.
 */

// Apple-style out-quart. Feels premium because it decelerates smoothly.
const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
// Snappier in-quart for exits — words leave with intent, not drift.
const EASE_IN = Easing.bezier(0.64, 0, 0.78, 0);
const BG_CROSSFADE_FRAMES = 3;

function fitHeroSize(text: string) {
  const clean = text.replace(/[^\p{L}\p{N} ']/gu, "");
  const longest = Math.max(3, ...clean.split(/\s+/).map((w) => w.length));
  const wordCount = clean.split(/\s+/).length;
  const base = 1650 / longest;
  const density = wordCount > 1 ? 0.78 : 1;
  return Math.max(150, Math.min(430, base * density));
}

function normalizeHandle(name?: string | null) {
  if (!name) return "";
  const cleaned = name.startsWith("@") ? name.slice(1) : name;
  return `@${cleaned.toLowerCase().replace(/[^a-z0-9._]+/g, "")}`.slice(0, 28);
}

/**
 * Entrance + exit for a beat. `hold` is the beat's relative hold weight
 * (1 = normal, >1 = lingering emphasis, <1 = quick). Heavier beats get a
 * slower, more deliberate entrance; every beat gets a short exit before
 * the hard cut so the transition doesn't feel snapped.
 */
/**
 * Yellow reference: most beats settle straight up, but every so often a beat
 * drifts in from the left or the right. Deterministic by beat index so a
 * re-render is identical, and never two slides in a row.
 */
function driftX(index: number) {
  const slot = index % 4;
  if (slot === 1) return -34;
  if (slot === 3) return 30;
  return 0;
}

function useBeatMotion(hold: number, sequenceFrames: number, index = 0) {
  const local = useCurrentFrame();
  // Entrance length: 4f snappy → 8f deliberate.
  const entranceLen = Math.round(interpolate(hold, [0.5, 1.8], [4, 9], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const exitLen = 5;
  const exitStart = Math.max(entranceLen + 6, sequenceFrames - exitLen);

  const entranceOpacity = interpolate(local, [0, entranceLen], [0, 1], { easing: EASE_OUT, extrapolateRight: "clamp" });
  const dx = driftX(index);
  const entranceY = interpolate(local, [0, entranceLen + 2], [dx ? 4 : 14, 0], { easing: EASE_OUT, extrapolateRight: "clamp" });
  const entranceX = interpolate(local, [0, entranceLen + 3], [dx, 0], { easing: EASE_OUT, extrapolateRight: "clamp" });

  const exitOpacity = interpolate(local, [exitStart, exitStart + exitLen], [1, 0], { easing: EASE_IN, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitY = interpolate(local, [exitStart, exitStart + exitLen], [0, -3], { easing: EASE_IN, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitX = interpolate(local, [exitStart, exitStart + exitLen], [0, dx * 0.12], { easing: EASE_IN, extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const opacity = Math.min(entranceOpacity, exitOpacity);
  const y = entranceY + exitY;
  return { opacity, transform: `translate(${entranceX + exitX}px, ${y}px)` };
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
  fg: string;
  fontFamily: string;
  handle: string;
  sequenceFrames: number;
}> = ({ beat, fg, fontFamily, handle, sequenceFrames }) => {
  const motion = useBeatMotion(beat.hold ?? 1, sequenceFrames);
  const line = beat.lines[0];
  const size = fitHeroSize(line.text);
  return (
    <AbsoluteFill>
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
            transform: `${motion.transform} translateY(-1.6%)`,
            opacity: motion.opacity,
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
  fg: string;
  fontFamily: string;
  handle: string;
  sequenceFrames: number;
}> = ({ beat, fg, fontFamily, handle, sequenceFrames }) => {
  const motion = useBeatMotion(beat.hold ?? 1, sequenceFrames);
  const heroLine = beat.lines.find((l) => l.size === "hero")?.text ?? beat.lines[0].text;
  const heroSize = fitHeroSize(heroLine);
  const smallSize = Math.max(46, Math.round(heroSize * 0.22));
  return (
    <AbsoluteFill>
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
            opacity: motion.opacity,
            transform: `${motion.transform} translateY(-1.6%)`,
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

/**
 * Background layer that fades between the current and next beat's color
 * during a short window at the start of each beat. Sits under the text
 * sequences and prevents the hard cut from feeling digital.
 */
const BackgroundLayer: React.FC<{
  spans: Array<{ from: number; frames: number }>;
  colors: string[];
  fallback: string;
}> = ({ spans, colors, fallback }) => {
  const frame = useCurrentFrame();
  // Find the active beat index for this frame.
  let idx = 0;
  for (let i = 0; i < spans.length; i++) {
    if (frame >= spans[i].from) idx = i;
    else break;
  }
  const currentColor = colors[idx] ?? fallback;
  const prevColor = idx > 0 ? colors[idx - 1] ?? fallback : currentColor;
  const cutFrame = spans[idx].from;
  // Blend from prev → current over BG_CROSSFADE_FRAMES starting at cutFrame.
  const blend = interpolate(frame, [cutFrame, cutFrame + BG_CROSSFADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  // Two stacked fills; top fades in.
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: prevColor }} />
      <AbsoluteFill style={{ backgroundColor: currentColor, opacity: blend }} />
    </>
  );
};

export const MotionPoster: React.FC<ReelProps> = ({ hook, script, brand, handle: handleProp, music }) => {
  const { durationInFrames } = useVideoConfig();
  useGoogleFont(brand.fonts.display || "Poppins");

  const rawBeats: Beat[] = script && script.length ? script : scriptFromHook(hook);
  const beats: Beat[] = rawBeats.filter(
    (b) => (b?.lines ?? []).some((l) => String(l?.text ?? "").trim().length > 0),
  );
  // TWO colours only: field ↔ ink, swapping per beat.
  const bgA = brand.colors.accent || brand.colors.background || "#F5E63B";
  const bgB = brand.colors.primary || "#0a0a0a";
  const handle = normalizeHandle(handleProp);

  // Frames follow per-beat hold weights and always sum to the full duration,
  // so a clamped heavy beat can never leave a blank card at the end.
  const weights = beats.map((b) => Math.max(0.35, b.hold ?? 1));
  const spans = computeSpans(weights, durationInFrames, 13, 96);


  const bgColors = beats.map((_, i) => (i % 2 === 0 ? bgA : bgB));
  const fontFamily = `'${brand.fonts.display || "Poppins"}', 'Helvetica Neue', Arial, sans-serif`;

  return (
    <AbsoluteFill style={{ backgroundColor: bgB, fontFamily }}>
      {music?.url ? <Audio src={music.url} volume={music.volume ?? 0.18} startFrom={music.startFrom ?? 0} /> : null}
      <BackgroundLayer spans={spans} colors={bgColors} fallback={bgB} />
      {beats.map((beat, i) => {
        const isA = i % 2 === 0;
        const fg = isA ? bgB : bgA;
        const { from, frames } = spans[i];
        return (
          <Sequence key={i} from={from} durationInFrames={frames} layout="none">
            {beat.layout === "stack" ? (
              <StackBeat beat={beat} fg={fg} fontFamily={fontFamily} handle={handle} sequenceFrames={frames} />
            ) : (
              <SingleBeat beat={beat} fg={fg} fontFamily={fontFamily} handle={handle} sequenceFrames={frames} />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
