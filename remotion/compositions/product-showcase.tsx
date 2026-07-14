import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { ReelProps } from "../brand";

export const ProductShowcase: React.FC<ReelProps> = ({ hook, brand, product }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  const imageUrl = (product?.image_url as string | undefined) ?? null;

  return (
    <AbsoluteFill style={{ backgroundColor: brand.colors.background }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            flex: 1,
            backgroundColor: brand.colors.primary,
            backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            transform: `scale(${1 + (1 - t) * 0.06})`,
          }}
        />
        <div
          style={{
            padding: 80,
            backgroundColor: brand.colors.background,
            color: brand.colors.text,
            fontFamily: brand.fonts.display,
          }}
        >
          <div
            style={{
              fontSize: 96,
              lineHeight: 1.05,
              fontWeight: 700,
              letterSpacing: -2,
              opacity: t,
              transform: `translateY(${(1 - t) * 24}px)`,
            }}
          >
            {hook}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
