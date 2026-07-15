/**
 * RenderService — thin abstraction over the video renderer.
 *
 * The Lovable app owns everything except pixel rendering. A concrete
 * implementation (VpsRenderService) POSTs a self-contained job to a
 * remote worker; swapping in a different renderer later means writing
 * a new implementation and no callers change.
 */

export type BrandTokens = {
  colors: { primary: string; accent: string; background: string; text: string };
  fonts: { display: string; body: string };
  logoUrl?: string | null;
};

export type TypographyStylePlan = {
  version: "primitive-typography-v1";
  composition?: {
    canvasMood?: "editorial" | "bold-poster" | "minimal" | "saas-clean" | "creator-caption";
    backgroundMode?: "solid" | "split-field" | "framed-negative-space" | "accent-band" | "soft-panel";
    safeMargin?: number;
  };
  typography?: {
    casing?: "as-written" | "uppercase" | "title";
    displayWeight?: number;
    supportWeight?: number;
    tracking?: number;
    lineHeight?: number;
  };
  beats: Array<{
    text: string;
    hero: string[];
    supportBefore?: string;
    supportAfter?: string;
    emphasis?: "quiet" | "normal" | "strong" | "hero";
    layout?: "center-stack" | "upper-left" | "lower-left" | "split-left" | "right-rail" | "full-phrase" | "poster-block";
    align?: "center" | "left" | "right";
    holdWeight?: number;
    colorRole?: "base" | "invert" | "accent-bg" | "primary-bg";
    emptySpace?: "balanced" | "top-heavy" | "bottom-heavy" | "wide";
    transition?: "settle" | "pop" | "wipe" | "cut" | "slide";
  }>;
};

export type RenderProps = {
  hook: string;
  caption?: string;
  brand: BrandTokens;
  product?: Record<string, unknown>;
  seed?: number;
  variant?: "stagger" | "cascade" | "bounce" | "mask" | "shuffle" | "swing";
  stylePlan?: TypographyStylePlan;
};

export type RenderJobPayload = {
  jobId: string;
  templateId: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  props: RenderProps;
  upload: { signedUrl: string; path: string };
  // Direct-write mode: worker updates render_jobs + reels via Supabase REST.
  // Removes the need for an inbound HTTP callback (which required a published app).
  supabase: {
    url: string;
    serviceKey: string;
    reelId: string | null;
    storagePath: string;
    signedUrlExpiresIn: number;
  };
  // Kept for backward-compat with older worker builds; new worker ignores it.
  callback?: { url: string; hmacKeyId: string };
};

export interface RenderService {
  submit(job: RenderJobPayload): Promise<{ workerJobId: string; accepted: boolean }>;
  health(): Promise<{ ok: boolean; version?: string }>;
}

export class VpsRenderService implements RenderService {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async submit(job: RenderJobPayload) {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/render`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(job),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`VPS render worker rejected job (${res.status}): ${body.slice(0, 500)}`);
    }
    const data = (await res.json().catch(() => ({}))) as { jobId?: string };
    return { workerJobId: data.jobId ?? job.jobId, accepted: true };
  }

  async health() {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/health`, {
      headers: { authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) return { ok: false };
    return (await res.json().catch(() => ({ ok: true }))) as { ok: boolean; version?: string };
  }
}

/** Factory that reads env inside the caller (server-only). */
export function getRenderService(): RenderService {
  const url = process.env.VPS_RENDER_URL;
  const token = process.env.RENDER_WORKER_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Render worker not configured. Set VPS_RENDER_URL and RENDER_WORKER_TOKEN.",
    );
  }
  return new VpsRenderService(url, token);
}
