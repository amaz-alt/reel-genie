import { AbsoluteFill, Audio, Easing, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { computeSpans, scriptFromHook, useGoogleFont, type Beat, type ReelProps } from "../brand";

/**
 * HYBRID FLOW — the blend of Base Level 2 (slide movement) and v0.7.2
 * (per-word/per-line text movement).
 *
 * Design language is UNCHANGED from motion-poster / bold-editorial:
 *  - two colours only (field ↔ ink), inverting per beat
 *  - single hero words or kicker+hero stacks
 *  - top-center watermark, brand display font at weight 900
 *  - no captions inside the video
 *
 * The only new thing is a per-beat MOTION MODE. Each beat picks exactly one of:
 *   "slide" — the whole block drifts in (left/right or top/bottom), text static
 *   "text"  — the block sits still, words/lines stagger in one after another
 *   "both"  — a small block drift AND a light word stagger (used sparingly)
 *   "settle"— pure fade + 8px settle, no drift, no stagger (a breath)
 *
 * Mode is derived from the copy itself (word count, emphasis/hold weight,
 * punctuation) plus the beat index, so it is deterministic — a re-render is
 * identical — but never mechanical: no mode repeats three beats in a row and
 * "both" never lands twice back to back.
 */

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const EASE_IN = Easing.bezier(0.64, 0, 0.78, 0);
const BG_CROSSFADE_FRAMES = 3;

type MotionMode = "slide" | "text" | "both" | "settle";
type Axis = "x" | "y";

function heroSize(text: string) {
  const clean = text.replace(/[^\p{L}\p{N} ']/gu, "");
  const longest = Math.max(3, ...clean.split(/\s+/).map((w) => w.length));
  const wordCount = clean.split(/\s+/).length;
  const base = 1620 / longest;
  const density = wordCount > 1 ? 0.76 : 1;
  return Math.max(146, Math.min(425, base * density));
}

function normalizeHandle(name?: string | null) {
  if (!name) return "";
  const cleaned = name.startsWith("@") ? name.slice(1) : name;
  return `@${cleaned.toLowerCase().replace(/[^a-z0-9._]+/g, "")}`.slice(0, 28);
}

function beatText(beat: Beat) {
  return (beat.lines ?? []).map((l) => String(l?.text ?? "")).join(" ").trim();
}

/**
 * Intuitive per-beat choice. Longer, multi-word beats read better when the
 * words arrive one by one; short punchy hero words read better when the whole
 * card moves; heavy/lingering beats get a quiet settle.
 */
function planModes(beats: Beat[]): Array<{ mode: MotionMode; axis: Axis; dir: 1 | -1 }> {
  const out: Array<{ mode: MotionMode; axis: Axis; dir: 1 | -1 }> = [];
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const text = beatText(beat);
    const words = text.split(/\s+/).filter(Boolean).length;
    const hold = beat.hold ?? 1;
    const emphatic = /[!?]$/.test(text) || hold >= 1.35;
    const quick = hold <= 0.7;

    let mode: MotionMode;
    if (words >= 4 || (beat.layout === "stack" && words >= 3)) mode = "text";
    else if (quick || words <= 2) mode = "slide";
    else if (emphatic) mode = "both";
    else mode = i % 3 === 2 ? "settle" : "text";

    // Sparingly: promote roughly every 5th beat to the full combo.
    if (mode !== "both" && i > 0 && i % 5 === 0 && out[i - 1].mode !== "both") mode = "both";
    // Never three of the same in a row — swap for the complementary feel.
    if (i >= 2 && out[i - 1].mode === mode && out[i - 2].mode === mode) {
      mode = mode === "text" ? "slide" : mode === "slide" ? "text" : "settle";
    }
    // "both" never back to back.
    if (mode === "both" && i > 0 && out[i - 1].mode === "both") mode = "text";

    // Alternate the travel axis so horizontal and vertical entrances trade off.
    const axis: Axis = i % 2 === 0 ? "x" : "y";
    const dir: 1 | -1 = Math.floor(i / 2) % 2 === 0 ? -1 : 1;
    out.push({ mode, axis, dir });
  }
  return out;
}

/** Block-level entrance/exit. Drift only when the plan asks for it. */
function useBlockMotion(opts: {
  mode: MotionMode;
  axis: Axis;
  dir: 1 | -1;
  hold: number;
  sequenceFrames: number;
}) {
  const local = useCurrentFrame();
  const { mode, axis, dir, hold, sequenceFrames } = opts;
  const entranceLen = Math.round(
    interpolate(hold, [0.5, 1.8], [5, 10], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const exitLen = 5;
  const exitStart = Math.max(entranceLen + 6, sequenceFrames - exitLen);

  const travel = mode === "slide" ? 34 : mode === "both" ? 16 : 0;
  const dx = axis === "x" ? travel * dir : 0;
  const dy = axis === "y" ? travel * dir : mode === "settle" ? 8 : travel ? 0 : 6;

  const inX = interpolate(local, [0, entranceLen + 3], [dx, 0], { easing: EASE_OUT, extrapolateRight: "clamp" });
  const inY = interpolate(local, [0, entranceLen + 2], [dy, 0], { easing: EASE_OUT, extrapolateRight: "clamp" });
  const inO = interpolate(local, [0, entranceLen], [0, 1], { easing: EASE_OUT, extrapolateRight: "clamp" });

  const outO = interpolate(local, [exitStart, exitStart + exitLen], [1, 0], {
    easing: EASE_IN,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const outX = interpolate(local, [exitStart, exitStart + exitLen], [0, dx * 0.12], {
    easing: EASE_IN,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const outY = interpolate(local, [exitStart, exitStart + exitLen], [0, -3], {
    easing: EASE_IN,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return {
    opacity: Math.min(inO, outO),
    transform: `translate(${inX + outX}px, ${inY + outY}px)`,
  };
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
        top: 92,
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
        opacity: 0.9,
        textTransform: "uppercase",
      }}
    >
      <IGIcon color={color} />
      <span>{handle}</span>
    </div>
  );
};

/** Words arrive one after another — only when the beat's mode allows it. */
const Words: React.FC<{
  text: string;
  stagger: boolean;
  amount: number;
  axis: Axis;
  beatIndex: number;
  fontSize: number;
}> = ({ text, stagger, amount, axis, beatIndex, fontSize }) => {
  const local = useCurrentFrame();
  const words = text.split(/\s+/).filter(Boolean);
  if (!stagger) return <>{text}</>;
  return (
    <>
      {words.map((w, i) => {
        const delay = i * 2;
        const dir = (beatIndex + i) % 2 === 0 ? -1 : 1;
        const travel = dir * amount;
        const p = interpolate(local, [delay, delay + 10], [travel, 0], {
          easing: EASE_OUT,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const o = interpolate(local, [delay, delay + 7], [0, 1], {
          easing: EASE_OUT,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              transform: axis === "x" ? `translateX(${p}px)` : `translateY(${p}px)`,
              opacity: o,
              marginRight: i === words.length - 1 ? 0 : fontSize * 0.22,
            }}
          >
            {w}
          </span>
        );
      })}
    </>
  );
};

/** One stacked line, arriving just after the line above it. */
const Line: React.FC<{
  order: number;
  stagger: boolean;
  amount: number;
  axis: Axis;
  beatIndex: number;
  children: React.ReactNode;
}> = ({ order, stagger, amount, axis, beatIndex, children }) => {
  const local = useCurrentFrame();
  if (!stagger) return <div>{children}</div>;
  const delay = order * 3;
  const dir = (beatIndex + order) % 2 === 0 ? -1 : 1;
  const p = interpolate(local, [delay, delay + 10], [dir * amount, 0], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const o = interpolate(local, [delay, delay + 7], [0, 1], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ transform: axis === "x" ? `translateX(${p}px)` : `translateY(${p}px)`, opacity: o }}>
      {children}
    </div>
  );
};

const BeatBody: React.FC<{
  beat: Beat;
  fg: string;
  fontFamily: string;
  sequenceFrames: number;
  index: number;
  plan: { mode: MotionMode; axis: Axis; dir: 1 | -1 };
}> = ({ beat, fg, fontFamily, sequenceFrames, index, plan }) => {
  const block = useBlockMotion({
    mode: plan.mode,
    axis: plan.axis,
    dir: plan.dir,
    hold: beat.hold ?? 1,
    sequenceFrames,
  });
  const lines = (beat.lines ?? []).filter((l) => l && String(l.text ?? "").trim().length > 0);
  if (!lines.length) return null;

  const stagger = plan.mode === "text" || plan.mode === "both";
  const staggerAmount = plan.mode === "both" ? 14 : 26;
  // Text staggers on the opposite axis to the block so the two reads separate.
  const textAxis: Axis = plan.mode === "both" ? (plan.axis === "x" ? "y" : "x") : plan.axis;

  const heroText = lines.find((l) => l.size === "hero")?.text ?? lines[0].text;
  const heroSz = heroSize(heroText);
  const smallSz = Math.max(45, Math.round(heroSz * 0.21));

  if (beat.layout === "single" || lines.length === 1) {
    return (
      <div
        style={{
          fontFamily,
          color: fg,
          fontWeight: 900,
          fontSize: heroSz,
          letterSpacing: `${-heroSz * 0.045}px`,
          lineHeight: 0.94,
          textAlign: "center",
          opacity: block.opacity,
          transform: `${block.transform} translateY(-1.6%)`,
          padding: "0 70px",
        }}
      >
        <Words
          text={lines[0].text}
          stagger={stagger}
          amount={staggerAmount}
          axis={textAxis}
          beatIndex={index}
          fontSize={heroSz}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily,
        color: fg,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: Math.round(heroSz * 0.02),
        opacity: block.opacity,
        transform: `${block.transform} translateY(-1.6%)`,
        padding: "0 70px",
      }}
    >
      {lines.map((l, i) => {
        const isHero = l.size === "hero";
        const sz = isHero ? heroSz : smallSz;
        return (
          <Line
            key={i}
            order={i}
            stagger={stagger}
            amount={staggerAmount}
            axis={textAxis}
            beatIndex={index}
          >
            <div
              style={{
                fontWeight: isHero ? 900 : 700,
                fontSize: sz,
                letterSpacing: `${-sz * (isHero ? 0.045 : 0.018)}px`,
                lineHeight: 0.94,
              }}
            >
              {l.text}
            </div>
          </Line>
        );
      })}
    </div>
  );
};

const BackgroundLayer: React.FC<{
  spans: Array<{ from: number; frames: number }>;
  colors: string[];
  fallback: string;
}> = ({ spans, colors, fallback }) => {
  const frame = useCurrentFrame();
  let idx = 0;
  for (let i = 0; i < spans.length; i++) {
    if (frame >= spans[i].from) idx = i;
    else break;
  }
  const currentColor = colors[idx] ?? fallback;
  const prevColor = idx > 0 ? colors[idx - 1] ?? fallback : currentColor;
  const cutFrame = spans[idx].from;
  const blend = interpolate(frame, [cutFrame, cutFrame + BG_CROSSFADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: prevColor }} />
      <AbsoluteFill style={{ backgroundColor: currentColor, opacity: blend }} />
    </>
  );
};

export const HybridFlow: React.FC<ReelProps> = ({ hook, script, brand, handle: handleProp, music }) => {
  const { durationInFrames } = useVideoConfig();
  useGoogleFont(brand.fonts.display || "Poppins");

  const rawBeats: Beat[] = script && script.length ? script : scriptFromHook(hook);
  const beats: Beat[] = rawBeats.filter(
    (b) => (b?.lines ?? []).some((l) => String(l?.text ?? "").trim().length > 0),
  );

  // TWO colours only: field ↔ ink, inverting per beat.
  const field = brand.colors.accent || brand.colors.background || "#F5E63B";
  const ink = brand.colors.primary || "#0a0a0a";
  const handle = normalizeHandle(handleProp);

  const weights = beats.map((b) => Math.max(0.35, b.hold ?? 1));
  const spans = computeSpans(weights, durationInFrames, 13, 96);
  const bgColors = beats.map((_, i) => (i % 2 === 0 ? field : ink));
  const fgColors = beats.map((_, i) => (i % 2 === 0 ? ink : field));
  const plans = planModes(beats);

  const fontFamily = `'${brand.fonts.display || "Poppins"}', 'Helvetica Neue', Arial, sans-serif`;

  return (
    <AbsoluteFill style={{ backgroundColor: field, fontFamily }}>
      {music?.url ? <Audio src={music.url} volume={music.volume ?? 0.17} startFrom={music.startFrom ?? 0} /> : null}
      <BackgroundLayer spans={spans} colors={bgColors} fallback={field} />
      {beats.map((beat, i) => {
        const { from, frames } = spans[i];
        return (
          <Sequence key={i} from={from} durationInFrames={frames} layout="none">
            <AbsoluteFill>
              <Watermark handle={handle} color={fgColors[i]} />
              <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
                <BeatBody
                  beat={beat}
                  fg={fgColors[i]}
                  fontFamily={fontFamily}
                  sequenceFrames={frames}
                  index={i}
                  plan={plans[i]}
                />
              </AbsoluteFill>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
