import { Composition } from "remotion";
import { MotionPoster } from "./compositions/motion-poster";
import { KineticType } from "./compositions/kinetic-type";
import { ProductShowcase } from "./compositions/product-showcase";
import { QuoteCard } from "./compositions/quote-card";
import { BeforeAfter } from "./compositions/before-after";
import { DEFAULT_BRAND, type ReelProps } from "./brand";

const defaultProps: ReelProps = {
  hook: "brands don't need attention they need emotion story people motion service feeling",
  caption: "Short caption preview.",
  brand: {
    ...DEFAULT_BRAND,
    colors: { primary: "#0a0a0a", accent: "#F5E63B", background: "#0a0a0a", text: "#F5E63B" },
  },
  handle: "@yp.motionstudio",
};

const base = { width: 1080, height: 1920, fps: 30, durationInFrames: 270 } as const;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="motion-poster" component={MotionPoster} defaultProps={defaultProps} {...base} />
    <Composition id="kinetic-type" component={KineticType} defaultProps={defaultProps} {...base} />
    <Composition id="product-showcase" component={ProductShowcase} defaultProps={defaultProps} {...base} />
    <Composition id="quote-card" component={QuoteCard} defaultProps={defaultProps} {...base} />
    <Composition id="before-after" component={BeforeAfter} defaultProps={defaultProps} {...base} />
  </>
);
