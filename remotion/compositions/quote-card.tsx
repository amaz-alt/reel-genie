import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { ReelProps } from "../brand";

export const QuoteCard: React.FC<ReelProps> = ({ hook, brand }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.colors.background,
        color: brand.colors.text,
        padding: 120,
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontFamily: `Georgia, ${brand.fonts.display}, serif`,
          fontSize: 96,
          fontStyle: "italic",
          lineHeight: 1.15,
          opacity: t,
          transform: `translateY(${(1 - t) * 40}px)`,
        }}
      >
        <span style={{ color: brand.colors.accent, fontSize: 160, lineHeight: 0.5 }}>“</span>
        <div style={{ marginTop: 24 }}>{hook}</div>
      </div>
    </AbsoluteFill>
  );
};
