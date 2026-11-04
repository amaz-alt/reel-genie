import React from "react";
import { AbsoluteFill, Loop, OffthreadVideo, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useGoogleFont, type BrandTokens } from "../brand";

export type BrollHookBeat = {
  text: string;
  align: "left" | "center" | "right";
  position: "upper" | "center" | "lower";
  /** pill = brand field card with ink text · band = full-width ink bar with field text */
  mode: "pill" | "band";
  font: "display" | "body";
  size: number;
  /** Relative on-screen duration weight (roughly proportional to text length). */
  weight: number;
};

export type BrollHookProps = {
  hook: string;
  beats?: BrollHookBeat[];
  video: { url: string; durationSeconds: number };
  brand: BrandTokens;
};

export type BrollHookOverlayProps = {
  beats: BrollHookBeat[];
  beatIndex: number;
  brand: BrandTokens;
};

/** Fallback beat used when a job payload predates the multi-beat format. */
export const legacyBeat = (hook: string): BrollHookBeat => ({
  text: hook,
  align: "center",
  position: "lower",
  mode: "pill",
  font: "display",
  size: hook.length > 56 ? 68 : hook.length > 38 ? 82 : 100,
  weight: 1,
});

const JUSTIFY = { upper: "flex-start", center: "center", lower: "flex-end" } as const;
const ALIGN_SELF = { left: "flex-start", center: "center", right: "flex-end" } as const;
const PAD = { upper: "170px 76px 0", center: "0 76px", lower: "0 76px 190px" } as const;

/**
 * One beat of the hook. Exactly the two brand colours, inverting per beat:
 * pill beats show ink text on the field colour, band beats invert to field
 * text on a full-width ink bar. Alignment and vertical position vary per beat
 * so the text reads like an edited caption track, never one stacked paragraph.
 */
const BeatCard: React.FC<{ beat: BrollHookBeat; brand: BrandTokens; entrance: number }> = ({ beat, brand, entrance }) => {
  const ink = brand.colors.primary || "#111111";
  const field = brand.colors.accent || brand.colors.background || "#F5E63B";
  const fontFamily = beat.font === "body" ? brand.fonts.body : brand.fonts.display;
  const text: React.CSSProperties = {
    fontFamily,
    fontSize: beat.size,
    fontWeight: beat.font === "body" ? 700 : 800,
    lineHeight: 1.06,
    textAlign: beat.align,
    overflowWrap: "anywhere",
  };
  return (
    <AbsoluteFill style={{ justifyContent: JUSTIFY[beat.position], padding: PAD[beat.position], opacity: entrance }}>
      {beat.mode === "band" ? (
        <div style={{ ...text, backgroundColor: ink, color: field, padding: "26px 46px" }}>{beat.text}</div>
      ) : (
        <div
          style={{
            ...text,
            alignSelf: ALIGN_SELF[beat.align],
            backgroundColor: field,
            color: ink,
            padding: "24px 36px",
            borderRadius: 14,
            maxWidth: 920,
            boxShadow: "0 20px 55px rgba(0,0,0,0.38)",
          }}
        >
          {beat.text}
        </div>
      )}
    </AbsoluteFill>
  );
};

/** Subtle directional entrance, varying per beat (drift / side slide / fade). */
const BeatEntrance: React.FC<{ beat: BrollHookBeat; brand: BrandTokens; index: number }> = ({ beat, brand, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = interpolate(frame, [0, Math.round(fps * 0.3)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dir = index % 3;
  const transform =
    dir === 1
      ? `translateX(${(1 - entrance) * 38}px)`
      : dir === 2
        ? `translateX(${(1 - entrance) * -38}px)`
        : `translateY(${(1 - entrance) * 18}px)`;
  return (
    <AbsoluteFill style={{ transform }}>
      <BeatCard beat={beat} brand={brand} entrance={entrance} />
    </AbsoluteFill>
  );
};

export const BrollHook: React.FC<BrollHookProps> = ({ hook, beats, video, brand }) => {
  useGoogleFont(brand.fonts.display, [700, 800, 900]);
  useGoogleFont(brand.fonts.body, [400, 700]);
  const { fps, durationInFrames } = useVideoConfig();
  const list = beats?.length ? beats : [legacyBeat(hook)];
  const totalWeight = list.reduce((sum, beat) => sum + beat.weight, 0);
  let acc = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: brand.colors.primary || "#111111" }}>
      <Loop durationInFrames={Math.max(1, Math.round(video.durationSeconds * fps))}>
        <OffthreadVideo src={video.url} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </Loop>
      {list.map((beat, index) => {
        const from = Math.round((acc / totalWeight) * durationInFrames);
        acc += beat.weight;
        const dur = Math.max(1, Math.round((beat.weight / totalWeight) * durationInFrames));
        return (
          <Sequence key={`${index}-${beat.text}`} from={from} durationInFrames={dur}>
            <BeatEntrance beat={beat} brand={brand} index={index} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/** Transparent single-frame overlay for one beat (fully settled). The entrance is applied by ffmpeg. */
export const BrollHookOverlay: React.FC<BrollHookOverlayProps> = ({ beats, beatIndex, brand }) => {
  useGoogleFont(brand.fonts.display, [700, 800, 900]);
  useGoogleFont(brand.fonts.body, [400, 700]);
  const beat = beats[beatIndex];
  if (!beat) return null;
  return <BeatCard beat={beat} brand={brand} entrance={1} />;
};
