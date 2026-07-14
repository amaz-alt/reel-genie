export type BrandTokens = {
  colors: { primary: string; accent: string; background: string; text: string };
  fonts: { display: string; body: string };
  logoUrl?: string | null;
};

export type ReelProps = {
  hook: string;
  caption?: string;
  brand: BrandTokens;
  product?: Record<string, unknown>;
};

export const DEFAULT_BRAND: BrandTokens = {
  colors: { primary: "#111111", accent: "#ff3b30", background: "#f5f1ea", text: "#111111" },
  fonts: { display: "Space Grotesk", body: "Inter" },
  logoUrl: null,
};
