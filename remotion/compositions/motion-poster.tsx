import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { ReelProps } from "../brand";

/**
 * MOTION POSTER — hardcoded recreation of the yp.motionstudio reference reel.
 *
 * Design language (locked from reference, do NOT interpret):
 *  - Full-bleed background, alternating YELLOW ↔ BLACK per beat.
 *  - Hero: ONE word, centered, black weight (900), tight tracking, huge scale.
 *  - Support: previous word tiny top-left, next word tiny bottom-right.
 *  - Watermark: brand handle small at top-center.
 *  - Transitions: HARD CUT. No easing, no springs, no fades.
 *  - Rhythm: ~0.6–0.9s per beat.
 */

const YELLOW_FALLBACK = "#F5E63B";
const BLACK_FALLBACK = "#0A0A0A";

function fitFontSize(word: string) {
  // Longer words shrink; single short words go huge like the reference.
  const clean = word.replace(/[^\p{L}\p{N}']/gu, "");
  const len = Math.max(3, clean.length);
  const size = 1650 / len;
  return Math.max(170, Math.min(430, size));
}

function handleFromBrand(name?: string | null) {
  if (!name) return "";
  return `@${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`.slice(0, 24);
}

export const MotionPoster: React.FC<ReelProps> = ({ hook, brand }) => {
  const { durationInFrames } = useVideoConfig();
  const yellow = brand.colors.accent || YELLOW_FALLBACK;
  const black = brand.colors.primary || BLACK_FALLBACK;
  const handle = handleFromBrand(brand.fonts ? (brand as unknown as { name?: string }).name : "");
  // brand.name isn't part of BrandTokens; pull from logoUrl-adjacent brand identity if present.
  // Fallback silently — the reference watermark is decoration, the beats carry the design.

  const words = hook.trim().split(/\s+/).filter(Boolean);
  const beats = words.length ? words : ["hook"];
  const framesPerBeat = Math.max(14, Math.floor(durationInFrames / beats.length));

  const displayStack = `'Helvetica Neue', 'Arial Black', 'Inter', system-ui, sans-serif`;

  return (
    <AbsoluteFill style={{ fontFamily: displayStack, backgroundColor: black }}>
      {beats.map((word, i) => {
        const isYellow = i % 2 === 0;
        const bg = isYellow ? yellow : black;
        const fg = isYellow ? black : yellow;
        const size = fitFontSize(word);
        const prev = i > 0 ? beats[i - 1] : null;
        const next = i < beats.length - 1 ? beats[i + 1] : null;

        return (
          <Sequence key={`${i}-${word}`} from={i * framesPerBeat} durationInFrames={framesPerBeat}>
            <AbsoluteFill style={{ backgroundColor: bg }}>
              {/* Watermark */}
              {handle ? (
                <div
                  style={{
                    position: "absolute",
                    top: 96,
                    left: 0,
                    right: 0,
                    textAlign: "center",
                    color: fg,
                    fontSize: 24,
                    fontWeight: 700,
                    letterSpacing: 2,
                    opacity: 0.9,
                    textTransform: "uppercase",
                  }}
                >
                  <span style={{ fontSize: 22, marginRight: 8 }}>◉</span>
                  {handle}
                </div>
              ) : null}

              {/* Support before — tiny prev word, top-left */}
              {prev ? (
                <div
                  style={{
                    position: "absolute",
                    top: 260,
                    left: 96,
                    color: fg,
                    fontSize: 46,
                    fontWeight: 600,
                    letterSpacing: -0.4,
                    opacity: 0.92,
                  }}
                >
                  {prev.replace(/[.,!?;:]+$/g, "")}
                </div>
              ) : null}

              {/* Hero word — centered, massive */}
              <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
                <div
                  style={{
                    color: fg,
                    fontWeight: 900,
                    fontSize: size,
                    letterSpacing: -size * 0.045,
                    lineHeight: 0.98,
                    textAlign: "center",
                    // ~1.8% optical shift up so mathematical centering doesn't feel bottom-heavy
                    transform: "translateY(-1.8%)",
                    padding: "0 60px",
                  }}
                >
                  {word}
                </div>
              </AbsoluteFill>

              {/* Support after — tiny next word, bottom-right */}
              {next ? (
                <div
                  style={{
                    position: "absolute",
                    bottom: 280,
                    right: 96,
                    color: fg,
                    fontSize: 46,
                    fontWeight: 600,
                    letterSpacing: -0.4,
                    opacity: 0.92,
                  }}
                >
                  {next.replace(/[.,!?;:]+$/g, "")}
                </div>
              ) : null}
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
