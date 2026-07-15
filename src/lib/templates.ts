export const TEMPLATES = [
  {
    id: "kinetic-type",
    name: "AI Typography Engine",
    description: "Dynamic layout, hierarchy, pacing, and motion primitives planned per hook and reference style.",
    swatch: "linear-gradient(135deg,#111 0%,#111 60%,#ff3b30 60%,#ff3b30 100%)",
  },
  {
    id: "product-showcase",
    name: "Product Showcase",
    description: "Split-screen with product image and hook. Best when your sheet includes an image URL.",
    swatch: "linear-gradient(135deg,#f5f1ea 0%,#f5f1ea 50%,#111 50%,#111 100%)",
  },
  {
    id: "quote-card",
    name: "Quote Card",
    description: "Serif-style pull quote on a warm background. Best for insight-driven brands.",
    swatch: "linear-gradient(135deg,#fef3c7 0%,#fde68a 100%)",
  },
  {
    id: "before-after",
    name: "Before / After",
    description: "Two-panel transformation with the hook as headline. Best for services & results.",
    swatch: "linear-gradient(90deg,#1f2937 0%,#1f2937 50%,#ff3b30 50%,#ff3b30 100%)",
  },
] as const;

export type TemplateId = (typeof TEMPLATES)[number]["id"];
