export const TEMPLATES = [
  {
    id: "motion-poster",
    name: "Motion Poster (ref: yp.motionstudio)",
    description: "Yellow↔black hard-cut posters. Single hero words or size-contrast stacks. Uses brand primary + accent.",
    swatch: "linear-gradient(135deg,#F5E63B 0%,#F5E63B 50%,#0a0a0a 50%,#0a0a0a 100%)",
  },
  {
    id: "bold-editorial",
    name: "Bold Editorial (ref: rendyr.video)",
    description: "Green↔cream hard-cut editorial. Kicker + hero stacks. Uses brand accent + background.",
    swatch: "linear-gradient(135deg,#1e6b2e 0%,#1e6b2e 50%,#eae9e2 50%,#eae9e2 100%)",
  },
  {
    id: "hybrid-flow",
    name: "Hybrid Flow (blend of both)",
    description: "Same two-colour design language, but each beat intuitively picks its own motion: sometimes the slide moves, sometimes only the words, occasionally both.",
    swatch: "linear-gradient(135deg,#F5E63B 0%,#F5E63B 33%,#0a0a0a 33%,#0a0a0a 66%,#F5E63B 66%,#F5E63B 100%)",
  },
  {
    id: "alternate",
    name: "Alternate (recommended)",
    description: "Auto-alternates between Motion Poster, Bold Editorial and Hybrid Flow across renders for variety.",
    swatch: "linear-gradient(135deg,#F5E63B 0%,#F5E63B 25%,#0a0a0a 25%,#0a0a0a 50%,#1e6b2e 50%,#1e6b2e 75%,#eae9e2 75%,#eae9e2 100%)",
  },
] as const;

export type TemplateId = (typeof TEMPLATES)[number]["id"];
