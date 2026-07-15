import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { ReelProps } from "../brand";
import { normalizePlan, PrimitiveBeat, timingEngine } from "../typography-engine";

/**
 * Intelligent Typography Engine.
 *
 * This is intentionally not a fixed kinetic template. The composition only
 * orchestrates reusable primitives: AI style plan → timing engine → layout
 * engine → hierarchy engine → transition engine → brand palette renderer.
 */
export const KineticType: React.FC<ReelProps> = ({ hook, brand, seed, stylePlan }) => {
  const { durationInFrames } = useVideoConfig();
  const plan = normalizePlan(hook, seed ?? 1, stylePlan);
  const beats = timingEngine(plan, durationInFrames);

  if (!beats.length) {
    return <AbsoluteFill style={{ backgroundColor: brand.colors.background }} />;
  }

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.colors.background,
        fontFamily: brand.fonts.display,
      }}
    >
      {beats.map((beat) => (
        <Sequence key={`${beat.index}-${beat.text}`} from={beat.from} durationInFrames={beat.duration + 4}>
          <PrimitiveBeat beat={beat} plan={plan} brand={brand} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};