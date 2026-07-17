import { Composition } from "remotion";
import { MotionPoster } from "./compositions/motion-poster";
import { BoldEditorial } from "./compositions/bold-editorial";
import { KineticType } from "./compositions/kinetic-type";
import { ProductShowcase } from "./compositions/product-showcase";
import { QuoteCard } from "./compositions/quote-card";
import { BeforeAfter } from "./compositions/before-after";
import { DEFAULT_BRAND, type ReelProps, type Beat } from "./brand";

const demoScript: Beat[] = [
  { layout: "stack", lines: [{ text: "the", size: "small" }, { text: "truth is", size: "hero" }] },
  { layout: "stack", lines: [{ text: "the price of", size: "small" }, { text: "progress", size: "hero" }] },
  { layout: "single", lines: [{ text: "is pain", size: "hero" }] },
  { layout: "single", lines: [{ text: "most people choose", size: "hero" }] },
  { layout: "stack", lines: [{ text: "comfort", size: "hero" }, { text: "over", size: "small" }, { text: "growth", size: "hero" }] },
  { layout: "stack", lines: [{ text: "but if", size: "small" }, { text: "you", size: "hero" }] },
  { layout: "single", lines: [{ text: "want to", size: "hero" }] },
  { layout: "single", lines: [{ text: "achieve", size: "hero" }] },
  { layout: "single", lines: [{ text: "your goals", size: "hero" }] },
];

const defaultProps: ReelProps = {
  hook: "the truth is the price of progress is pain",
  script: demoScript,
  brand: DEFAULT_BRAND,
  handle: "@yp.motionstudio",
};

const base = { width: 1080, height: 1920, fps: 30, durationInFrames: 600 } as const;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="motion-poster" component={MotionPoster} defaultProps={defaultProps} {...base} />
    <Composition id="bold-editorial" component={BoldEditorial} defaultProps={defaultProps} {...base} />
    <Composition id="kinetic-type" component={KineticType} defaultProps={defaultProps} {...base} />
    <Composition id="product-showcase" component={ProductShowcase} defaultProps={defaultProps} {...base} />
    <Composition id="quote-card" component={QuoteCard} defaultProps={defaultProps} {...base} />
    <Composition id="before-after" component={BeforeAfter} defaultProps={defaultProps} {...base} />
  </>
);
