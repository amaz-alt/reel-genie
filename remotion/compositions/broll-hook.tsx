import React from "react";
import { AbsoluteFill, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useGoogleFont, type BrandTokens } from "../brand";

export type BrollHookProps = {
  hook: string;
  video: { url: string };
  brand: BrandTokens;
};

export const BrollHook: React.FC<BrollHookProps> = ({ hook, video, brand }) => {
  useGoogleFont(brand.fonts.display, [700, 800, 900]);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = interpolate(frame, [0, Math.round(fps * 0.35)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ink = brand.colors.primary || "#111111";
  const field = brand.colors.accent || brand.colors.background || "#F5E63B";
  const fontSize = hook.length > 56 ? 68 : hook.length > 38 ? 82 : 100;

  return (
    <AbsoluteFill style={{ backgroundColor: ink }}>
      <OffthreadVideo src={video.url} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          padding: "0 82px 230px",
          background: "linear-gradient(transparent 54%, rgba(0,0,0,0.58))",
        }}
      >
        <div
          style={{
            maxWidth: 900,
            padding: "24px 32px",
            backgroundColor: field,
            color: ink,
            borderRadius: 8,
            fontFamily: brand.fonts.display,
            fontSize,
            fontWeight: 800,
            lineHeight: 1.04,
            textAlign: "center",
            opacity: entrance,
            transform: `translateY(${(1 - entrance) * 18}px)`,
            overflowWrap: "anywhere",
          }}
        >
          {hook}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};