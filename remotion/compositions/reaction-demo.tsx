/**
 * Reaction + Demo — standalone module composition.
 *
 * Deliberately isolated from the typography engine: it does not import or
 * modify motion-poster / bold-editorial / hybrid-flow or their helpers. It
 * only reuses the read-only brand token type + font loader.
 *
 * The reel is assembled from two real video clips (a UGC reaction and a short
 * product demo) plus ONE short curiosity one-liner. Variation comes from the
 * arrangement / timing / text treatment chosen upstream, not from effects.
 */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Loop,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useGoogleFont, type BrandTokens } from "../brand";

export type ReactionDemoArrangement = "reaction-cut" | "reaction-pip" | "split-stack" | "demo-first";
export type ReactionDemoTextStyle = "caption-bar" | "boxed" | "clean";
export type ReactionDemoHookPlacement = "reaction" | "demo" | "both";
export type ReactionDemoHookTiming = "instant" | "on-beat" | "delayed";

export type ReactionDemoProps = {
  hook: string;
  brand: BrandTokens;
  handle?: string | null;
  reaction: { url: string; startFrom?: number };
  demo: { url: string; startFrom?: number };
  /** Seconds of screen time given to each half. */
  reactionSeconds: number;
  demoSeconds: number;
  arrangement: ReactionDemoArrangement;
  textStyle: ReactionDemoTextStyle;
  hookPlacement: ReactionDemoHookPlacement;
  hookTiming: ReactionDemoHookTiming;
  music?: { id: string; title: string; artist: string; url: string; volume?: number; startFrom?: number };
  seed?: number;
};

function twoColors(brand: BrandTokens) {
  const ink = brand.colors.primary || "#0a0a0a";
  const field = brand.colors.accent || brand.colors.background || "#F5E63B";
  return { ink, field };
}

/** Readable one-liner lockup. Never more than 3 lines on screen. */
const HookText: React.FC<{
  text: string;
  brand: BrandTokens;
  style: ReactionDemoTextStyle;
  delayFrames: number;
  anchor: "top" | "bottom" | "center";
}> = ({ text, brand, style, delayFrames, anchor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { ink, field } = twoColors(brand);
  const t = frame - delayFrames;
  const appear = interpolate(t, [0, Math.round(fps * 0.28)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rise = interpolate(appear, [0, 1], [22, 0]);
  if (t < 0) return null;

  const fontSize = text.length > 46 ? 76 : text.length > 30 ? 90 : 104;
  const base: React.CSSProperties = {
    fontFamily: brand.fonts.display,
    fontWeight: 800,
    fontSize,
    lineHeight: 1.06,
    letterSpacing: "-0.02em",
    textAlign: "center",
    maxWidth: 900,
    opacity: appear,
    transform: `translateY(${rise}px)`,
  };

  const treatment: React.CSSProperties =
    style === "caption-bar"
      ? { background: field, color: ink, padding: "26px 30px", borderRadius: 10 }
      : style === "boxed"
        ? {
            background: ink,
            color: field,
            padding: "28px 32px",
            borderRadius: 22,
            border: `4px solid ${field}`,
          }
        : { color: "#ffffff", textShadow: "0 6px 34px rgba(0,0,0,0.6)" };

  return (
    <AbsoluteFill
      style={{
        justifyContent: anchor === "top" ? "flex-start" : anchor === "bottom" ? "flex-end" : "center",
        alignItems: "center",
        padding: anchor === "center" ? 90 : 150,
      }}
    >
      <div style={{ ...base, ...treatment }}>{text}</div>
    </AbsoluteFill>
  );
};

const Clip: React.FC<{ url: string; startFrom?: number; muted?: boolean; loopFrames?: number }> = ({
  url,
  startFrom,
  muted,
  loopFrames,
}) => {
  const { fps } = useVideoConfig();
  const video = (
    <OffthreadVideo
      src={url}
      muted={muted}
      startFrom={startFrom ? Math.round(startFrom * fps) : undefined}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
  if (!loopFrames) return video;
  return <Loop durationInFrames={loopFrames}>{video}</Loop>;
};

export const ReactionDemo: React.FC<ReactionDemoProps> = ({
  hook,
  brand,
  handle,
  reaction,
  demo,
  reactionSeconds,
  demoSeconds,
  arrangement,
  textStyle,
  hookPlacement,
  hookTiming,
  music,
}) => {
  useGoogleFont(brand.fonts.display, [700, 800, 900]);
  const { fps, durationInFrames } = useVideoConfig();
  const { ink } = twoColors(brand);

  const reactionFrames = Math.max(fps, Math.round(reactionSeconds * fps));
  const demoFrames = Math.max(fps, Math.round(demoSeconds * fps));

  const delayFor = (segmentStart: number) => {
    const offset =
      hookTiming === "instant" ? 0 : hookTiming === "on-beat" ? Math.round(fps * 0.35) : Math.round(fps * 0.85);
    return segmentStart + offset;
  };

  const showOnReaction = hookPlacement === "reaction" || hookPlacement === "both";
  const showOnDemo = hookPlacement === "demo" || hookPlacement === "both";

  const Music = music?.url ? (
    <Audio
      src={music.url}
      volume={music.volume ?? 0.16}
      startFrom={music.startFrom ? Math.round(music.startFrom * fps) : 0}
    />
  ) : null;

  const Handle = handle ? (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: 56 }}>
      <div
        style={{
          fontFamily: brand.fonts.body,
          fontSize: 30,
          fontWeight: 600,
          color: "#ffffff",
          opacity: 0.78,
          textShadow: "0 2px 12px rgba(0,0,0,0.6)",
        }}
      >
        {handle}
      </div>
    </AbsoluteFill>
  ) : null;

  if (arrangement === "reaction-pip") {
    return (
      <AbsoluteFill style={{ background: ink }}>
        <Clip url={demo.url} startFrom={demo.startFrom} muted loopFrames={durationInFrames} />
        <Sequence durationInFrames={reactionFrames}>
          <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-end", padding: 56 }}>
            <div
              style={{
                width: 420,
                height: 420,
                borderRadius: 999,
                overflow: "hidden",
                border: `8px solid ${twoColors(brand).field}`,
                boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
              }}
            >
              <Clip url={reaction.url} startFrom={reaction.startFrom} loopFrames={reactionFrames} />
            </div>
          </AbsoluteFill>
        </Sequence>
        <HookText text={hook} brand={brand} style={textStyle} delayFrames={delayFor(0)} anchor="bottom" />
        {Handle}
        {Music}
      </AbsoluteFill>
    );
  }

  if (arrangement === "split-stack") {
    return (
      <AbsoluteFill style={{ background: ink, flexDirection: "column" }}>
        <div style={{ height: "42%", overflow: "hidden" }}>
          <Clip url={reaction.url} startFrom={reaction.startFrom} loopFrames={durationInFrames} />
        </div>
        <div style={{ height: "58%", overflow: "hidden" }}>
          <Clip url={demo.url} startFrom={demo.startFrom} muted loopFrames={durationInFrames} />
        </div>
        <HookText text={hook} brand={brand} style={textStyle} delayFrames={delayFor(0)} anchor="center" />
        {Handle}
        {Music}
      </AbsoluteFill>
    );
  }

  const demoFirst = arrangement === "demo-first";
  const firstFrames = demoFirst ? demoFrames : reactionFrames;
  const secondFrames = demoFirst ? reactionFrames : demoFrames;

  return (
    <AbsoluteFill style={{ background: ink }}>
      <Sequence durationInFrames={firstFrames}>
        <AbsoluteFill>
          {demoFirst ? (
            <Clip url={demo.url} startFrom={demo.startFrom} muted loopFrames={firstFrames} />
          ) : (
            <Clip url={reaction.url} startFrom={reaction.startFrom} loopFrames={firstFrames} />
          )}
          {(demoFirst ? showOnDemo : showOnReaction) && (
            <HookText text={hook} brand={brand} style={textStyle} delayFrames={delayFor(0)} anchor="center" />
          )}
          {Handle}
        </AbsoluteFill>
      </Sequence>
      <Sequence from={firstFrames} durationInFrames={secondFrames}>
        <AbsoluteFill>
          {demoFirst ? (
            <Clip url={reaction.url} startFrom={reaction.startFrom} loopFrames={secondFrames} />
          ) : (
            <Clip url={demo.url} startFrom={demo.startFrom} muted loopFrames={secondFrames} />
          )}
          {(demoFirst ? showOnReaction : showOnDemo) && (
            <HookText
              text={hook}
              brand={brand}
              style={textStyle}
              delayFrames={delayFor(0)}
              anchor={demoFirst ? "center" : "bottom"}
            />
          )}
          {Handle}
        </AbsoluteFill>
      </Sequence>
      {Music}
    </AbsoluteFill>
  );
};
