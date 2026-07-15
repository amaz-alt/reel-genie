import { Composition } from "remotion";
import { KineticType } from "./compositions/kinetic-type";
import { ProductShowcase } from "./compositions/product-showcase";
import { QuoteCard } from "./compositions/quote-card";
import { BeforeAfter } from "./compositions/before-after";
import { DEFAULT_BRAND, type ReelProps } from "./brand";

const defaultProps: ReelProps = {
  hook: "Your hook goes here in ten words or less",
  caption: "Short caption preview.",
  brand: DEFAULT_BRAND,
};

const base = { width: 1080, height: 1920, fps: 30, durationInFrames: 180 } as const;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="kinetic-type"
      component={KineticType}
      defaultProps={defaultProps}
      {...base}
    />
    <Composition
      id="product-showcase"
      component={ProductShowcase}
      defaultProps={defaultProps}
      {...base}
    />
    <Composition
      id="quote-card"
      component={QuoteCard}
      defaultProps={defaultProps}
      {...base}
    />
    <Composition
      id="before-after"
      component={BeforeAfter}
      defaultProps={defaultProps}
      {...base}
    />
  </>
);
