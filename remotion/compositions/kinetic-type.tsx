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
import { rng, VARIANTS } from "../brand";

/**
 * TRUE kinetic typography. Words pop one at a time, hero-style, with:
 *  - overshoot spring entry (scale 0.2 → 1.08 → 1)
 *  - beat-synced background flashes on accent words
 *  - subtle camera shake / rotate to keep the frame alive
 *  - crossfade + slide between beats so it never feels static
 *  - randomized layout offsets (left/right/center) per word
 *  - per-word motion variants selected from the seed
 */
export const KineticType: React.FC<ReelProps> = ({ hook, caption, brand, seed, variant }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const s = seed ?? Math.floor(Math.random() * 1e9);
  const rGlobal = rng(s);
  const chosen = variant ?? VARIANTS[Math.floor(rGlobal() * VARIANTS.length)];

  const words = hook.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return <AbsoluteFill style={{ background: brand.colors.background }} />;

  // Budget: reserve last 30f for caption+outro, first 6f for intro punch.
  const introFrames = 6;
  const outroFrames = 30;
  const beatBudget = Math.max(60, durationInFrames - introFrames - outroFrames);
  const perWord = Math.max(14, Math.floor(beatBudget / words.length));
  const overlap = Math.round(perWord * 0.35); // beats overlap for continuous motion

  // Pick 1-2 "accent" words for hero emphasis (usually the last impactful ones).
  const accentSet = new Set<number>();
  if (words.length >= 2) accentSet.add(words.length - 1);
  if (words.length >= 4) accentSet.add(words.length - 3);

  // Global camera shake (very subtle, always on).
  const shakeX = Math.sin(frame * 0.31) * 4 + Math.sin(frame * 0.13 + 1.2) * 3;
  const shakeY = Math.cos(frame * 0.27) * 3 + Math.sin(frame * 0.17 + 0.7) * 2;
  const camScale = 1 + Math.sin(frame * 0.05) * 0.008;

  // Background pulse on every beat.
  const beatIndex = Math.min(
    words.length - 1,
    Math.max(0, Math.floor((frame - introFrames) / perWord)),
  );
  const beatLocal = (frame - introFrames) - beatIndex * perWord;
  const flashStrength = accentSet.has(beatIndex)
    ? interpolate(beatLocal, [0, 4, 14], [0, 0.35, 0], { extrapolateRight: "clamp" })
    : interpolate(beatLocal, [0, 3, 10], [0, 0.12, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.colors.background,
        color: brand.colors.text,
        fontFamily: brand.fonts.display,
        overflow: "hidden",
      }}
    >
      {/* beat flash overlay */}
      <AbsoluteFill
        style={{
          background: brand.colors.accent,
          opacity: flashStrength,
          mixBlendMode: "multiply",
        }}
      />

      {/* moving grain / gradient blob */}
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            left: width * (0.2 + 0.5 * (0.5 + 0.5 * Math.sin(frame * 0.02 + s))) - 400,
            top: height * (0.2 + 0.5 * (0.5 + 0.5 * Math.cos(frame * 0.017 + s))) - 400,
            width: 800,
            height: 800,
            borderRadius: 9999,
            background: brand.colors.accent,
            opacity: 0.18,
            filter: "blur(140px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -200,
            top: height * 0.55,
            width: 700,
            height: 700,
            borderRadius: 9999,
            background: brand.colors.primary,
            opacity: 0.08,
            filter: "blur(160px)",
          }}
        />
      </AbsoluteFill>

      {/* sweeping accent bars */}
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 180,
            height: 10,
            background: brand.colors.accent,
            transformOrigin: "left center",
            transform: `scaleX(${interpolate(frame, [2, 18], [0, 1], {
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            })})`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 240,
            height: 6,
            background: brand.colors.text,
            opacity: 0.35,
            transformOrigin: "right center",
            transform: `scaleX(${interpolate(frame, [8, 26], [0, 1], {
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            })})`,
          }}
        />
      </AbsoluteFill>

      {/* HERO WORD STAGE — one word at a time, big, centered, punchy */}
      <AbsoluteFill
        style={{
          transform: `translate(${shakeX}px, ${shakeY}px) scale(${camScale})`,
        }}
      >
        {words.map((word, i) => {
          const start = introFrames + i * perWord;
          const duration = perWord + overlap; // overlap with next
          return (
            <Sequence key={i} from={start} durationInFrames={duration}>
              <HeroWord
                word={word}
                index={i}
                total={words.length}
                accent={accentSet.has(i)}
                variant={chosen}
                seed={s + i * 131}
                colors={brand.colors}
                fonts={brand.fonts}
                perWord={perWord}
              />
            </Sequence>
          );
        })}
      </AbsoluteFill>

      {/* caption reveal near end */}
      {caption ? (
        <AbsoluteFill
          style={{
            padding: "0 96px 220px",
            justifyContent: "flex-end",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              fontFamily: brand.fonts.body,
              fontSize: 42,
              lineHeight: 1.3,
              maxWidth: 900,
              color: brand.colors.text,
              opacity: interpolate(
                frame,
                [durationInFrames - outroFrames, durationInFrames - outroFrames + 14],
                [0, 0.9],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              ),
              transform: `translateY(${interpolate(
                frame,
                [durationInFrames - outroFrames, durationInFrames - outroFrames + 14],
                [24, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              )}px)`,
            }}
          >
            {caption}
          </div>
        </AbsoluteFill>
      ) : null}

      {/* progress bar at bottom */}
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          height: 8,
          width: `${(frame / durationInFrames) * 100}%`,
          background: brand.colors.accent,
        }}
      />
    </AbsoluteFill>
  );
};

type HeroWordProps = {
  word: string;
  index: number;
  total: number;
  accent: boolean;
  variant: (typeof VARIANTS)[number];
  seed: number;
  colors: { primary: string; accent: string; background: string; text: string };
  fonts: { display: string; body: string };
  perWord: number;
};

const HeroWord: React.FC<HeroWordProps> = ({
  word,
  accent,
  variant,
  seed,
  colors,
  fonts,
  perWord,
  index,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = rng(seed);

  // Font size scales with word length so long words still fill the frame.
  const len = word.length;
  const baseSize = accent
    ? len <= 4 ? 340 : len <= 7 ? 280 : len <= 10 ? 220 : 180
    : len <= 4 ? 260 : len <= 7 ? 220 : len <= 10 ? 180 : 150;

  // Layout offset varies per word so it never feels centered/static.
  const layoutRoll = r();
  const align =
    accent ? "center" : layoutRoll < 0.33 ? "flex-start" : layoutRoll < 0.66 ? "center" : "flex-end";
  const vAlign = layoutRoll < 0.5 ? "center" : layoutRoll < 0.8 ? "flex-start" : "flex-end";

  // ENTRY — punchy overshoot.
  const entry = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 220, mass: 0.7 },
  });
  // EXIT — slide/scale out in last ~30% of beat.
  const exitStart = Math.floor(perWord * 0.72);
  const exit = interpolate(frame, [exitStart, exitStart + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const rotateJitter = (r() - 0.5) * (accent ? 4 : 10);
  const exitDirection = r() < 0.5 ? -1 : 1;

  // Per-letter reveal.
  const letters = word.split("");

  return (
    <AbsoluteFill
      style={{
        padding: "160px 80px 220px",
        justifyContent: vAlign,
        alignItems: align,
      }}
    >
      <div
        style={{
          transform: `translateY(${exit * -120 * exitDirection}px) scale(${
            interpolate(entry, [0, 0.6, 1], [0.2, 1.15, 1]) * (1 - exit * 0.4)
          }) rotate(${rotateJitter * (1 - entry)}deg)`,
          opacity: (1 - exit) * interpolate(entry, [0, 0.2], [0, 1], { extrapolateRight: "clamp" }),
          filter: `blur(${interpolate(entry, [0, 0.4], [12, 0], {
            extrapolateRight: "clamp",
          }) + exit * 8}px)`,
          display: "flex",
          gap: 0,
          lineHeight: 0.92,
        }}
      >
        {letters.map((ch, li) => {
          const letterDelay = li * 1.4;
          const lspring = spring({
            frame: frame - letterDelay,
            fps,
            config: { damping: 12, stiffness: 260, mass: 0.6 },
          });
          const yOff = interpolate(lspring, [0, 1], [80, 0]);
          const rot = interpolate(lspring, [0, 1], [li % 2 === 0 ? -14 : 14, 0]);

          // Variant-specific letter treatment (adds variety).
          let extra = "";
          if (variant === "shuffle") {
            const p = Math.min(1, Math.max(0, (frame - li * 0.8) / 10));
            const shown =
              p < 1
                ? String.fromCharCode(65 + Math.floor(rng(seed + li + frame)() * 26))
                : ch;
            return (
              <span
                key={li}
                style={{
                  display: "inline-block",
                  fontSize: baseSize,
                  fontWeight: 900,
                  letterSpacing: -6,
                  color: accent ? colors.accent : colors.text,
                  transform: `translateY(${yOff}px)`,
                  opacity: interpolate(lspring, [0, 1], [0, 1]),
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {shown}
              </span>
            );
          }
          if (variant === "swing") extra = ` rotate(${rot}deg)`;
          if (variant === "bounce") extra = ` scale(${interpolate(lspring, [0, 1], [0.3, 1])})`;

          return (
            <span
              key={li}
              style={{
                display: "inline-block",
                fontSize: baseSize,
                fontWeight: 900,
                letterSpacing: -6,
                color: accent ? colors.accent : colors.text,
                transform: `translateY(${yOff}px)${extra}`,
                opacity: interpolate(lspring, [0, 1], [0, 1]),
                textShadow: accent
                  ? `0 8px 0 ${colors.text}, 0 14px 30px ${colors.accent}55`
                  : `0 4px 0 ${colors.text}22`,
                fontStyle: variant === "cascade" && li % 3 === 0 ? "italic" : "normal",
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>

      {/* accent tag under hero words */}
      {accent ? (
        <div
          style={{
            marginTop: 32,
            fontFamily: fonts.body,
            fontSize: 34,
            letterSpacing: 10,
            textTransform: "uppercase",
            color: colors.text,
            opacity: interpolate(entry, [0.4, 1], [0, 0.7], { extrapolateRight: "clamp" }) * (1 - exit),
            transform: `translateY(${interpolate(entry, [0.4, 1], [20, 0], {
              extrapolateRight: "clamp",
            })}px)`,
          }}
        >
          ▍ {index === 0 ? "watch this" : "read that again"}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
