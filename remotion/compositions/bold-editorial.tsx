import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { scriptFromHook, useGoogleFont, type Beat, type ReelProps } from "../brand";

/**
 * BOLD EDITORIAL — reverse-engineered from the rendyr.video reference reel.
 *
 * Locked design language:
 *  - Full-bleed background alternates ACCENT ↔ BACKGROUND per beat.
 *    (green ↔ cream on the reference). Text is always PRIMARY on the light
 *    field and BACKGROUND on the dark field.
 *  - Layouts: "single" (one phrase centered) or "stack" (2-3 lines with
 *    dramatic size hierarchy — kicker on top, hero below, sometimes coda).
 *  - Watermark: tiny "@handle" top-center. No IG icon on this ref, just text.
 *  - Entrance: 4-frame fade + gentle blur-in (2px→0). No spin/shake.
 *  - Font: brand.fonts.display, weight 900. Slightly wider tracking than
 *    motion-poster to breathe on the light backgrounds.
 */

function heroSize(text: string) {
  const clean = text.replace(/[^\p{L}\p{N} ']/gu, "");
  const longest = Math.max(3, ...clean.split(/\s+/).map((w) => w.length));
  const wordCount = clean.split(/\s+/).length;
  const base = 1600 / longest;
  const density = wordCount > 1 ? 0.74 : 1;
  return Math.max(140, Math.min(420, base * density));
}

function normalizeHandle(name?: string | null) {
  if (!name) return "";
  const cleaned = name.startsWith("@") ? name.slice(1) : name;
  return `@${cleaned.toLowerCase().replace(/[^a-z0-9._]+/g, "")}`.slice(0, 28);
}

function useBeatEntrance(startFrame: number) {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  const opacity = interpolate(local, [0, 4], [0, 1], { extrapolateRight: "clamp" });
  const blur = interpolate(local, [0, 5], [2.2, 0], { extrapolateRight: "clamp" });
  const y = interpolate(local, [0, 6], [8, 0], { extrapolateRight: "clamp" });
  return {
    opacity,
    filter: `blur(${blur}px)`,
    transform: `translateY(${y}px)`,
  };
}

const Watermark: React.FC<{ handle: string; color: string }> = ({ handle, color }) => {
  if (!handle) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 96,
        left: 0,
        right: 0,
        textAlign: "center",
        color,
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: 2.2,
        opacity: 0.85,
        textTransform: "uppercase",
      }}
    >
      {handle}
    </div>
  );
};

const BeatBody: React.FC<{
  beat: Beat;
  fg: string;
  startFrame: number;
  fontFamily: string;
}> = ({ beat, fg, startFrame, fontFamily }) => {
  const entrance = useBeatEntrance(startFrame);
  const heroLineText = beat.lines.find((l) => l.size === "hero")?.text ?? beat.lines[0].text;
  const heroSz = heroSize(heroLineText);
  const smallSz = Math.max(44, Math.round(heroSz * 0.2));

  if (beat.layout === "single") {
    return (
      <div
        style={{
          fontFamily,
          color: fg,
          fontWeight: 900,
          fontSize: heroSz,
          letterSpacing: `${-heroSz * 0.04}px`,
          lineHeight: 0.94,
          textAlign: "center",
          opacity: entrance.opacity,
          filter: entrance.filter,
          transform: `${entrance.transform} translateY(-1.6%)`,
          padding: "0 70px",
        }}
      >
        {beat.lines[0].text}
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily,
        color: fg,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: Math.round(heroSz * 0.02),
        opacity: entrance.opacity,
        filter: entrance.filter,
        transform: `${entrance.transform} translateY(-1.6%)`,
        padding: "0 70px",
      }}
    >
      {beat.lines.map((l, i) => {
        const isHero = l.size === "hero";
        const sz = isHero ? heroSz : smallSz;
        return (
          <div
            key={i}
            style={{
              fontWeight: isHero ? 900 : 700,
              fontSize: sz,
              letterSpacing: `${-sz * (isHero ? 0.04 : 0.015)}px`,
              lineHeight: 0.94,
            }}
          >
            {l.text}
          </div>
        );
      })}
    </div>
  );
};

export const BoldEditorial: React.FC<ReelProps> = ({ hook, script, brand, handle: handleProp }) => {
  const { durationInFrames } = useVideoConfig();
  useGoogleFont(brand.fonts.display || "Poppins");

  const beats: Beat[] = script && script.length ? script : scriptFromHook(hook);
  // Light/dark pair drawn from brand tokens.
  const bgLight = brand.colors.background || "#eae9e2";
  const bgDark = brand.colors.accent || "#1e6b2e";
  const fgOnLight = brand.colors.primary || "#0a0a0a";
  const fgOnDark = bgLight;
  const handle = normalizeHandle(handleProp);

  const weights = beats.map((b) => Math.max(0.6, b.hold ?? 1));
  const totalW = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  const spans = weights.map((w) => {
    const frames = Math.max(15, Math.round((w / totalW) * durationInFrames));
    const from = cursor;
    cursor += frames;
    return { from, frames };
  });

  const fontFamily = `'${brand.fonts.display || "Poppins"}', 'Helvetica Neue', Arial, sans-serif`;

  return (
    <AbsoluteFill style={{ backgroundColor: bgLight, fontFamily }}>
      {beats.map((beat, i) => {
        const isLight = i % 2 === 0;
        const bg = isLight ? bgLight : bgDark;
        const fg = isLight ? fgOnLight : fgOnDark;
        const { from, frames } = spans[i];
        return (
          <Sequence key={i} from={from} durationInFrames={frames} layout="none">
            <AbsoluteFill style={{ backgroundColor: bg }}>
              <Watermark handle={handle} color={fg} />
              <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
                <BeatBody beat={beat} fg={fg} startFrame={from} fontFamily={fontFamily} />
              </AbsoluteFill>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
