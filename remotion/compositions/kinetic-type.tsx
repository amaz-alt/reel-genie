import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import type { ReelProps } from "../brand";
import { rng, VARIANTS } from "../brand";

/**
 * Kinetic typography with 6 per-word motion variants + seeded variety.
 * Each render can pick a different variant AND a different seed, so no two
 * reels look identical even on the same template.
 */
export const KineticType: React.FC<ReelProps> = ({ hook, caption, brand, seed, variant }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const s = seed ?? 1;
  const r = rng(s);
  const chosen = variant ?? VARIANTS[Math.floor(r() * VARIANTS.length)];

  const words = hook.trim().split(/\s+/).filter(Boolean);
  const accentIdx = words.length > 3 ? words.length - 1 - Math.floor(r() * 2) : words.length - 1;

  // Background: subtle animated gradient blob for depth.
  const blobT = frame / durationInFrames;
  const blobX = width * (0.15 + 0.7 * (0.5 + 0.5 * Math.sin(blobT * Math.PI * 2 + s)));
  const blobY = height * (0.2 + 0.6 * (0.5 + 0.5 * Math.cos(blobT * Math.PI * 2 * 0.7 + s)));

  // Layout: alignment varies by seed (left / center / mixed).
  const layoutRoll = r();
  const align =
    layoutRoll < 0.4 ? "flex-start" : layoutRoll < 0.75 ? "center" : "flex-start";
  const justify =
    layoutRoll < 0.4 ? "center" : layoutRoll < 0.75 ? "center" : "flex-end";

  // Font size scales down for longer hooks so they always fit.
  const baseSize =
    words.length <= 4 ? 168 : words.length <= 6 ? 138 : words.length <= 8 ? 118 : 100;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.colors.background,
        color: brand.colors.text,
        fontFamily: brand.fonts.display,
      }}
    >
      {/* soft accent blob */}
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            left: blobX - 360,
            top: blobY - 360,
            width: 720,
            height: 720,
            borderRadius: 9999,
            background: brand.colors.accent,
            opacity: 0.14,
            filter: "blur(120px)",
          }}
        />
      </AbsoluteFill>

      {/* diagonal accent bar sweeping in */}
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: height * 0.08,
            height: 8,
            background: brand.colors.accent,
            transformOrigin: "left center",
            transform: `scaleX(${interpolate(frame, [4, 22], [0, 1], {
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            })})`,
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          padding: "160px 96px 200px",
          justifyContent: justify,
          alignItems: align,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.18em 0.32em",
            lineHeight: 1.02,
            maxWidth: "100%",
            justifyContent: align === "center" ? "center" : "flex-start",
          }}
        >
          {words.map((w, i) => (
            <Word
              key={i}
              word={w}
              index={i}
              total={words.length}
              variant={chosen}
              accent={i === accentIdx}
              seed={s + i * 97}
              size={baseSize}
              colors={brand.colors}
              frame={frame}
              fps={fps}
              duration={durationInFrames}
            />
          ))}
        </div>

        {caption ? (
          <div
            style={{
              marginTop: 56,
              fontFamily: brand.fonts.body,
              fontSize: 40,
              lineHeight: 1.35,
              maxWidth: 820,
              opacity: interpolate(frame, [30, 55], [0, 0.85], {
                extrapolateRight: "clamp",
              }),
              transform: `translateY(${interpolate(frame, [30, 55], [16, 0], {
                extrapolateRight: "clamp",
              })}px)`,
              color: brand.colors.text,
            }}
          >
            {caption}
          </div>
        ) : null}
      </AbsoluteFill>

      {/* footer accent */}
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            left: 96,
            bottom: 96,
            fontFamily: brand.fonts.body,
            fontSize: 28,
            letterSpacing: 8,
            textTransform: "uppercase",
            opacity: interpolate(frame, [60, 90], [0, 0.55], { extrapolateRight: "clamp" }),
            color: brand.colors.text,
          }}
        >
          ● ● ●
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

type WordProps = {
  word: string;
  index: number;
  total: number;
  variant: (typeof VARIANTS)[number];
  accent: boolean;
  seed: number;
  size: number;
  colors: { primary: string; accent: string; background: string; text: string };
  frame: number;
  fps: number;
  duration: number;
};

const Word: React.FC<WordProps> = ({
  word,
  index,
  total,
  variant,
  accent,
  seed,
  size,
  colors,
  frame,
  fps,
  duration,
}) => {
  const r = rng(seed);
  const delay = 4 + index * (variant === "cascade" || variant === "shuffle" ? 3 : 5);
  const local = frame - delay;
  const sp = spring({ frame: local, fps, config: { damping: 14, stiffness: 140, mass: 0.9 } });

  // Exit animation in the last ~20 frames of the clip.
  const exitStart = duration - 22;
  const exitP = interpolate(frame, [exitStart, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  let transform = "";
  let opacity = 1;
  let filter: string | undefined;
  const letters = word.split("");

  const jitter = (r() - 0.5) * 40;

  switch (variant) {
    case "stagger": {
      const y = interpolate(sp, [0, 1], [110, 0]);
      opacity = interpolate(sp, [0, 1], [0, 1]);
      transform = `translateY(${y + exitP * -60}px)`;
      filter = `blur(${interpolate(sp, [0, 1], [8, 0])}px)`;
      break;
    }
    case "cascade": {
      // letter-by-letter reveal
      return (
        <span
          style={{
            display: "inline-flex",
            fontSize: size,
            fontWeight: 900,
            letterSpacing: -3,
            color: accent ? colors.accent : colors.text,
          }}
        >
          {letters.map((ch, li) => {
            const ld = delay + li * 2;
            const lsp = spring({
              frame: frame - ld,
              fps,
              config: { damping: 12, stiffness: 180 },
            });
            return (
              <span
                key={li}
                style={{
                  display: "inline-block",
                  transform: `translateY(${interpolate(lsp, [0, 1], [60, 0])}px) rotate(${interpolate(
                    lsp,
                    [0, 1],
                    [-25, 0],
                  )}deg)`,
                  opacity: interpolate(lsp, [0, 1], [0, 1]) * (1 - exitP),
                }}
              >
                {ch}
              </span>
            );
          })}
        </span>
      );
    }
    case "bounce": {
      const scale = interpolate(sp, [0, 1], [0.4, 1]);
      opacity = interpolate(sp, [0, 1], [0, 1]);
      transform = `scale(${scale * (1 - exitP * 0.3)}) rotate(${interpolate(sp, [0, 1], [
        jitter,
        0,
      ])}deg)`;
      break;
    }
    case "mask": {
      opacity = 1 - exitP;
      transform = `translateY(${interpolate(sp, [0, 1], [80, 0])}px)`;
      return (
        <span
          style={{
            display: "inline-block",
            overflow: "hidden",
            paddingBottom: 12,
          }}
        >
          <span
            style={{
              display: "inline-block",
              fontSize: size,
              fontWeight: 900,
              letterSpacing: -3,
              color: accent ? colors.accent : colors.text,
              transform,
              opacity,
            }}
          >
            {word}
          </span>
        </span>
      );
    }
    case "shuffle": {
      // scramble to reveal
      const progress = Math.min(1, Math.max(0, local / 14));
      const shuffled =
        progress < 1
          ? letters
              .map((ch, li) =>
                li / letters.length < progress
                  ? ch
                  : String.fromCharCode(65 + Math.floor(rng(seed + li + frame)() * 26)),
              )
              .join("")
          : word;
      opacity = interpolate(local, [0, 6], [0, 1], { extrapolateRight: "clamp" }) * (1 - exitP);
      transform = `translateY(${interpolate(local, [0, 10], [30, 0], {
        extrapolateRight: "clamp",
      })}px)`;
      return (
        <span
          style={{
            fontSize: size,
            fontWeight: 900,
            letterSpacing: -3,
            color: accent ? colors.accent : colors.text,
            transform,
            opacity,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {shuffled}
        </span>
      );
    }
    case "swing": {
      const rot = interpolate(sp, [0, 1], [index % 2 === 0 ? -30 : 30, 0]);
      opacity = interpolate(sp, [0, 1], [0, 1]) * (1 - exitP);
      transform = `translateY(${interpolate(sp, [0, 1], [50, 0])}px) rotate(${rot}deg)`;
      break;
    }
  }

  const scaleEmph = accent
    ? 1 + 0.04 * Math.sin(((frame - delay) / fps) * Math.PI * 2)
    : 1;

  return (
    <span
      style={{
        display: "inline-block",
        fontSize: size,
        fontWeight: 900,
        letterSpacing: -3,
        color: accent ? colors.accent : colors.text,
        transform: `${transform} scale(${scaleEmph})`,
        opacity,
        filter,
        textShadow: accent
          ? `0 6px 0 ${colors.accent}22, 0 2px 20px ${colors.accent}22`
          : undefined,
      }}
    >
      {word}
    </span>
  );
};
