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
import { rng } from "../brand";

/**
 * Clean kinetic typography.
 *
 * Design rules (deliberate, do not "spice up"):
 *  - ONE word on screen at a time. Big. Readable. No spin.
 *  - Motion = fade + short vertical slide + tiny scale settle. That's it.
 *  - Brand colors drive EVERY color decision. No hardcoded hex anywhere.
 *  - No caption drawn inside the video (caption belongs in the social post).
 *  - No camera shake, no rotation jitter, no blur, no shuffling glyphs.
 *  - Accent color highlights 1–2 key words, chosen deterministically per seed.
 */
export const KineticType: React.FC<ReelProps> = ({ hook, brand, seed }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const s = seed ?? 1;
  const r = rng(s);

  const words = hook.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return <AbsoluteFill style={{ background: brand.colors.background }} />;
  }

  // Even beats across the whole video, tiny lead-in + tail.
  const leadIn = 6;
  const tail = 12;
  const beatBudget = Math.max(30, durationInFrames - leadIn - tail);
  const perWord = Math.max(18, Math.floor(beatBudget / words.length));

  // Pick 1–2 accent word indices deterministically. Prefer longer / later words.
  const accentIndices = new Set<number>();
  const scored = words
    .map((w, i) => ({ i, score: w.length + (i === words.length - 1 ? 3 : 0) + r() * 0.5 }))
    .sort((a, b) => b.score - a.score);
  accentIndices.add(scored[0].i);
  if (words.length >= 5) accentIndices.add(scored[1].i);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.colors.background,
        color: brand.colors.text,
        fontFamily: brand.fonts.display,
        overflow: "hidden",
      }}
    >
      {/* soft brand-tinted glow — static position, no wobble */}
      <div
        style={{
          position: "absolute",
          left: width * 0.5 - 500,
          top: height * 0.28,
          width: 1000,
          height: 1000,
          borderRadius: 9999,
          background: brand.colors.accent,
          opacity: 0.08,
          filter: "blur(180px)",
        }}
      />

      {/* thin brand accent rule */}
      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          top: 200,
          height: 4,
          background: brand.colors.accent,
          transformOrigin: "left center",
          transform: `scaleX(${interpolate(frame, [0, 20], [0, 1], {
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          })})`,
        }}
      />

      {/* brand name eyebrow */}
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 132,
          fontFamily: brand.fonts.body,
          fontSize: 28,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: brand.colors.text,
          opacity: 0.55,
        }}
      >
        {brand.fonts.display && brand.colors.primary ? "" : ""}
      </div>

      {/* HERO WORD STAGE */}
      {words.map((word, i) => {
        const start = leadIn + i * perWord;
        return (
          <Sequence key={i} from={start} durationInFrames={perWord + 6}>
            <HeroWord
              word={word}
              accent={accentIndices.has(i)}
              perWord={perWord}
              colors={brand.colors}
            />
          </Sequence>
        );
      })}

      {/* thin progress line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          height: 6,
          width: `${(frame / durationInFrames) * 100}%`,
          background: brand.colors.accent,
        }}
      />
    </AbsoluteFill>
  );
};

const HeroWord: React.FC<{
  word: string;
  accent: boolean;
  perWord: number;
  colors: { primary: string; accent: string; background: string; text: string };
}> = ({ word, accent, perWord, colors }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Font size scales with word length. Long words shrink so they always fit.
  const len = word.length;
  const size = len <= 4 ? 320 : len <= 7 ? 260 : len <= 10 ? 210 : len <= 14 ? 170 : 140;

  // Entry: fade + short slide up + soft scale settle. No overshoot, no rotate.
  const enter = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 140, mass: 0.9 },
  });

  // Exit: gentle fade + tiny slide up in the last ~25% of the beat.
  const exitStart = Math.floor(perWord * 0.75);
  const exit = interpolate(frame, [exitStart, exitStart + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  const translateY = interpolate(enter, [0, 1], [40, 0]) + exit * -30;
  const opacity = enter * (1 - exit);
  const scale = interpolate(enter, [0, 1], [0.94, 1]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "0 80px",
      }}
    >
      <div
        style={{
          transform: `translateY(${translateY}px) scale(${scale})`,
          opacity,
          fontSize: size,
          fontWeight: 900,
          letterSpacing: -4,
          lineHeight: 1,
          textAlign: "center",
          color: accent ? colors.accent : colors.text,
          textTransform: "uppercase",
          maxWidth: "100%",
          wordBreak: "break-word",
        }}
      >
        {word}
      </div>
    </AbsoluteFill>
  );
};
