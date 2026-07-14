import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { ReelProps } from "../brand";

export const BeforeAfter: React.FC<ReelProps> = ({ hook, brand }) => {
  const frame = useCurrentFrame();
  const split = interpolate(frame, [0, 60], [50, 50], { extrapolateRight: "clamp" });
  const t = interpolate(frame, [20, 60], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ fontFamily: brand.fonts.display }}>
      <div style={{ position: "absolute", inset: 0, display: "flex" }}>
        <div
          style={{
            width: `${split}%`,
            backgroundColor: brand.colors.primary,
            color: brand.colors.background,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 64,
            opacity: 0.7,
          }}
        >
          Before
        </div>
        <div
          style={{
            flex: 1,
            backgroundColor: brand.colors.accent,
            color: brand.colors.background,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 64,
          }}
        >
          After
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: 80,
          backgroundColor: brand.colors.background,
          color: brand.colors.text,
          fontSize: 88,
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: -2,
          opacity: t,
        }}
      >
        {hook}
      </div>
    </AbsoluteFill>
  );
};
