import { AbsoluteFill, Audio, Easing, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { computeSpans, scriptFromHook, useGoogleFont, type Beat, type ReelProps } from "../brand";

/**
 * BOLD EDITORIAL — reverse-engineered from the rendyr.video reference reel.
 *
 * Design language locked (see motion-poster.tsx for the sibling template).
 * This file only tunes the animation FEEL:
 *  - Cubic-bezier easing on entrance and exit
 *  - Entrance duration scales with the beat's hold weight
 *  - Subtle 3-frame background crossfade instead of a raw digital cut
 *  - Text exit (lift + fade) in the last 5 frames of each beat
 */

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const EASE_IN = Easing.bezier(0.64, 0, 0.78, 0);
const BG_CROSSFADE_FRAMES = 3;

function heroSize(text: string) {
  const clean = text.replace(/[^\p{L}\p{N} ']/gu, "");
  const longest = Math.max(3, ...clean.split(/\s+/).map((w) => w.length));
  const wordCount = clean.split(/\s+/).length;
  const base = 1600 / longest;
  const density = wordCount > 1 ? 0.74 : 1;
  return Math.max(140, Math.min(420, base * density));
}

function normalizeHandle(name?: string | null) {
  if (!name) return "";
  const cleaned = name.startsWith("@") ? name.slice(1) : name;
  return `@${cleaned.toLowerCase().replace(/[^a-z0-9._]+/g, "")}`.slice(0, 28);
}

/**
 * Green/white reference: occasional beats arrive from above or below instead
 * of just settling. Deterministic by beat index, never two in a row.
 */
function driftY(index: number) {
  const slot = index % 4;
  if (slot === 1) return -30;
  if (slot === 3) return 34;
  return 0;
}

function useBeatMotion(hold: number, sequenceFrames: number, index = 0) {
  const local = useCurrentFrame();
  const entranceLen = Math.round(interpolate(hold, [0.5, 1.8], [4, 10], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const exitLen = 5;
  const exitStart = Math.max(entranceLen + 6, sequenceFrames - exitLen);
  const dy = driftY(index);

  const entranceOpacity = interpolate(local, [0, entranceLen], [0, 1], { easing: EASE_OUT, extrapolateRight: "clamp" });
  const entranceY = interpolate(local, [0, entranceLen + 2], [dy || 10, 0], { easing: EASE_OUT, extrapolateRight: "clamp" });
  const entranceBlur = interpolate(local, [0, entranceLen], [1.6, 0], { easing: EASE_OUT, extrapolateRight: "clamp" });

  const exitOpacity = interpolate(local, [exitStart, exitStart + exitLen], [1, 0], { easing: EASE_IN, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitY = interpolate(local, [exitStart, exitStart + exitLen], [0, dy ? Math.sign(dy) * -4 : -3], { easing: EASE_IN, extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return {
    opacity: Math.min(entranceOpacity, exitOpacity),
    filter: `blur(${entranceBlur}px)`,
    transform: `translateY(${entranceY + exitY}px)`,
  };
}

const Watermark: React.FC<{ handle: string; color: string }> = ({ handle, color }) => {
  if (!handle) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 96,
        left: 0,
        right: 0,
        textAlign: "center",
        color,
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: 2.2,
        opacity: 0.85,
        textTransform: "uppercase",
      }}
    >
      {handle}
    </div>
  );
};

/** Words arrive one after another, alternating up/down drift. */
const StaggerWords: React.FC<{ text: string; beatIndex: number; fontSize: number }> = ({
  text,
  beatIndex,
  fontSize,
}) => {
  const local = useCurrentFrame();
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((w, i) => {
        const delay = i * 2;
        const dir = (beatIndex + i) % 2 === 0 ? 1 : -1;
        const y = interpolate(local, [delay, delay + 9], [dir * (words.length > 1 ? 26 : 16), 0], {
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
              transform: `translateY(${y}px)`,
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

/** One stacked line, arriving slightly after the line above it. */
const StaggerLine: React.FC<{ order: number; beatIndex: number; children: React.ReactNode }> = ({
  order,
  beatIndex,
  children,
}) => {
  const local = useCurrentFrame();
  const delay = order * 3;
  const dir = (beatIndex + order) % 2 === 0 ? 1 : -1;
  const y = interpolate(local, [delay, delay + 10], [dir * 22, 0], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const o = interpolate(local, [delay, delay + 7], [0, 1], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <div style={{ transform: `translateY(${y}px)`, opacity: o }}>{children}</div>;
};

const BeatBody: React.FC<{
  beat: Beat;
  fg: string;
  fontFamily: string;
  sequenceFrames: number;
  index: number;
}> = ({ beat, fg, fontFamily, sequenceFrames, index }) => {
  const motion = useBeatMotion(beat.hold ?? 1, sequenceFrames, index);
  const lines = (beat.lines ?? []).filter((l) => l && String(l.text ?? "").trim().length > 0);
  if (!lines.length) return null;
  const heroLineText = lines.find((l) => l.size === "hero")?.text ?? lines[0].text;
  const heroSz = heroSize(heroLineText);
  const smallSz = Math.max(44, Math.round(heroSz * 0.2));

  if (beat.layout === "single") {
    return (
      <div
        style={{
          fontFamily,
          color: fg,
          fontWeight: 900,
          fontSize: heroSz,
          letterSpacing: `${-heroSz * 0.04}px`,
          lineHeight: 0.94,
          textAlign: "center",
          opacity: motion.opacity,
          filter: motion.filter,
          transform: `${motion.transform} translateY(-1.6%)`,
          padding: "0 70px",
        }}
      >
        <StaggerWords text={lines[0].text} beatIndex={index} fontSize={heroSz} />
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
        opacity: motion.opacity,
        filter: motion.filter,
        transform: `${motion.transform} translateY(-1.6%)`,
        padding: "0 70px",
      }}
    >
      {lines.map((l, i) => {
        const isHero = l.size === "hero";
        const sz = isHero ? heroSz : smallSz;
        return (
          <StaggerLine key={i} order={i} beatIndex={index}>
            <div
              style={{
                fontWeight: isHero ? 900 : 700,
                fontSize: sz,
                letterSpacing: `${-sz * (isHero ? 0.04 : 0.015)}px`,
                lineHeight: 0.94,
              }}
            >
              {l.text}
            </div>
          </StaggerLine>
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

export const BoldEditorial: React.FC<ReelProps> = ({ hook, script, brand, handle: handleProp, music }) => {
  const { durationInFrames } = useVideoConfig();
  useGoogleFont(brand.fonts.display || "Poppins");

  const rawBeats: Beat[] = script && script.length ? script : scriptFromHook(hook);
  // Drop any beat the copywriter emitted with no usable text — those rendered
  // as blank coloured cards mid-reel.
  const beats: Beat[] = rawBeats.filter(
    (b) => (b?.lines ?? []).some((l) => String(l?.text ?? "").trim().length > 0),
  );
  // TWO colours only — a field colour and an ink colour. Each beat swaps which
  // one is the background, exactly like the references.
  const bgLight = brand.colors.accent || brand.colors.background || "#eae9e2";
  const bgDark = brand.colors.primary || "#0a0a0a";
  const fgOnLight = bgDark;
  const fgOnDark = bgLight;
  const handle = normalizeHandle(handleProp);

  const weights = beats.map((b) => Math.max(0.35, b.hold ?? 1));
  // Spans always sum to the full duration — no dead tail, no blank card.
  const spans = computeSpans(weights, durationInFrames, 13, 96);

  const bgColors = beats.map((_, i) => (i % 2 === 0 ? bgLight : bgDark));
  const fgColors = beats.map((_, i) => (i % 2 === 0 ? fgOnLight : fgOnDark));


  const fontFamily = `'${brand.fonts.display || "Poppins"}', 'Helvetica Neue', Arial, sans-serif`;

  return (
    <AbsoluteFill style={{ backgroundColor: bgLight, fontFamily }}>
      {music?.url ? <Audio src={music.url} volume={music.volume ?? 0.16} startFrom={music.startFrom ?? 0} /> : null}
      <BackgroundLayer spans={spans} colors={bgColors} fallback={bgLight} />
      {beats.map((beat, i) => {
        const fg = fgColors[i];
        const { from, frames } = spans[i];
        return (
          <Sequence key={i} from={from} durationInFrames={frames} layout="none">
            <AbsoluteFill>
              <Watermark handle={handle} color={fg} />
              <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
                <BeatBody beat={beat} fg={fg} fontFamily={fontFamily} sequenceFrames={frames} index={i} />
              </AbsoluteFill>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
