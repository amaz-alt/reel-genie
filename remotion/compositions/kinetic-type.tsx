import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ReelProps } from "../brand";

export const KineticType: React.FC<ReelProps> = ({ hook, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = hook.split(/\s+/);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.colors.primary,
        color: brand.colors.background,
        fontFamily: brand.fonts.display,
        padding: 96,
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35em", lineHeight: 1.05 }}>
        {words.map((w, i) => {
          const delay = i * 6;
          const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
          const y = interpolate(s, [0, 1], [80, 0]);
          const opacity = interpolate(s, [0, 1], [0, 1]);
          const isAccent = i === words.length - 1;
          return (
            <span
              key={i}
              style={{
                fontSize: 128,
                fontWeight: 800,
                letterSpacing: -3,
                transform: `translateY(${y}px)`,
                opacity,
                color: isAccent ? brand.colors.accent : brand.colors.background,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
