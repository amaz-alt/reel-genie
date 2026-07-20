import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* -------------------- list render jobs for a brand -------------------- */
export const listRenderJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ brand_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: jobs, error } = await context.supabase
      .from("render_jobs")
      .select(
        "id, reel_id, template_id, status, attempts, max_attempts, last_error, dispatched_at, completed_at, created_at, updated_at, storage_path, logs",
      )
      .eq("brand_id", data.brand_id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return jobs ?? [];
  });

import {
  getRenderService,
  type RenderJobPayload,
  type RenderProps,
  type TypographyStylePlan,
} from "./render/RenderService";
import { TEMPLATES } from "./templates";

const DEFAULT_COLORS = {
  primary: "#111111",
  accent: "#ff3b30",
  background: "#f5f1ea",
  text: "#111111",
};
const DEFAULT_FONTS = { display: "Space Grotesk", body: "Inter" };
const MAX_ATTEMPTS = 3;

type LogEntry = { at: string; level: "info" | "warn" | "error"; stage: string; message: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appendLog(admin: any, jobId: string, entry: Omit<LogEntry, "at">) {
  const line: LogEntry = { at: new Date().toISOString(), ...entry };
  // Best-effort append; Postgres has no jsonb append operator in the client so
  // we read+write. Concurrent writes on the same job are not expected.
  const { data } = await admin.from("render_jobs").select("logs").eq("id", jobId).maybeSingle();
  const logs = Array.isArray(data?.logs) ? data.logs : [];
  logs.push(line);
  await admin.from("render_jobs").update({ logs }).eq("id", jobId);
}

type ScriptBeat = {
  layout: "single" | "stack";
  lines: Array<{ text: string; size: "small" | "hero" }>;
  hold?: number;
};

type CopyResult = {
  hook: string;
  caption: string;
  hashtags: string[];
  script: ScriptBeat[];
};

type LockedTemplateId = "motion-poster" | "bold-editorial";

const LOCKED_TEMPLATE_IDS = ["motion-poster", "bold-editorial"] as const;

function isLockedTemplateId(value: unknown): value is LockedTemplateId {
  return value === "motion-poster" || value === "bold-editorial";
}

function oppositeTemplate(templateId: LockedTemplateId): LockedTemplateId {
  return templateId === "motion-poster" ? "bold-editorial" : "motion-poster";
}

/* -------------------- product rotation from Google Sheet -------------------- */

type PickedProduct = { rowKey: string; row: Record<string, string> };

function extractSheetId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (c === "\r") {
        // skip
      } else {
        cur += c;
      }
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

async function fetchSheetRows(sheetId: string, tab: string | null): Promise<Record<string, string>[]> {
  const sheetName = tab && tab.trim() ? encodeURIComponent(tab.trim()) : "Sheet1";
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sheet fetch failed: ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase() || `col_${Math.random().toString(36).slice(2, 6)}`);
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });
}

async function pickNextProduct(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  input: { brandId: string; sheetUrl: string | null; sheetId: string | null; sheetTab: string | null },
): Promise<PickedProduct | null> {
  const sheetId = input.sheetId || extractSheetId(input.sheetUrl);
  if (!sheetId) return null;
  let rows: Record<string, string>[];
  try {
    rows = await fetchSheetRows(sheetId, input.sheetTab);
  } catch {
    return null;
  }
  if (!rows.length) return null;

  const { data: consumedRows } = await admin
    .from("products_consumed")
    .select("product_row_key")
    .eq("brand_id", input.brandId);
  const consumed = new Set<string>((consumedRows ?? []).map((r: { product_row_key: string }) => r.product_row_key));

  const withKey = rows.map((row, idx) => {
    const identity =
      row.id || row.sku || row.title || row.product || row.name || row.topic || Object.values(row).slice(0, 3).join("|");
    const rowKey = `${idx}:${identity}`.slice(0, 240);
    return { rowKey, row };
  });

  const unused = withKey.filter((r) => !consumed.has(r.rowKey));
  const pool = unused.length ? unused : withKey; // full rotation: recycle when exhausted
  const pick = pool[Math.floor(Math.random() * pool.length)];

  if (!unused.length) {
    // Rotation completed — reset the ledger so the next run starts fresh.
    await admin.from("products_consumed").delete().eq("brand_id", input.brandId);
  }
  await admin
    .from("products_consumed")
    .insert({ brand_id: input.brandId, product_row_key: pick.rowKey })
    .then(() => undefined, () => undefined);

  return pick;
}

/**
 * Structured copywriter — Alex Cattoni / Copy Posse pain-point storytelling.
 * Emits a full on-screen SCRIPT broken into hierarchy-aware beats (kicker +
 * hero + coda), not just a single hook. The composition renders one beat at
 * a time with size contrast to match the reference reels.
 */
 * Emits a full on-screen SCRIPT broken into hierarchy-aware beats (kicker +
 * hero + coda), not just a single hook. The composition renders one beat at
 * a time with size contrast to match the reference reels.
 */
async function generateCopy(input: {
  brandName: string;
  knowledgeBase: string | null;
  product?: Record<string, unknown> | null;
  voice?: "you" | "i-we";
}): Promise<CopyResult> {
  const key = process.env.LOVABLE_API_KEY;
  const fallback: CopyResult = {
    hook: "the truth is most of us picked comfort over the work that would have changed everything.",
    caption: "The uncomfortable stuff is where the change lives.",
    hashtags: ["#mindset", "#growth", "#truth", "#discipline", "#reels"],
    script: [
      { layout: "stack", lines: [{ text: "the", size: "small" }, { text: "truth is", size: "hero" }] },
      { layout: "single", lines: [{ text: "most of us", size: "hero" }] },
      { layout: "stack", lines: [{ text: "picked", size: "small" }, { text: "comfort", size: "hero" }] },
      { layout: "stack", lines: [{ text: "over the", size: "small" }, { text: "work", size: "hero" }] },
      { layout: "single", lines: [{ text: "that would have", size: "hero" }] },
      { layout: "single", lines: [{ text: "changed", size: "hero" }] },
      { layout: "single", lines: [{ text: "everything.", size: "hero" }] },
    ],
  };
  if (!key) return fallback;

  const voice = input.voice ?? (Math.random() < 0.5 ? "you" : "i-we");
  const voiceRule =
    voice === "you"
      ? "• Use SECOND-PERSON voice throughout ('you', 'your'). Speak directly to the viewer. Do NOT slip into 'I' or 'we'."
      : "• Use FIRST-PERSON confession voice throughout ('I', 'we', 'my', 'our'). Do NOT slip into 'you'.";

  const sys = [
    "You are a senior direct-response copywriter trained in the Alex Cattoni / Copy Posse school and in short-form kinetic typography reels.",
    "You are writing one 20–25 second reel. The output is not a slogan or a hook — it is a COMPLETE STORYTELLING SENTENCE broken into on-screen beats.",
    "",
    "COPY RULES (Copy Posse):",
    "• Speak like a real person mid-thought, not a marketer. No slogans, no rhyme, no cliches ('game-changer', 'level up', 'unlock', 'elevate', 'unleash').",
    "• Indirect storytelling that makes the viewer realise their own mistake, current situation, or pain point. Never accuse; observe.",
    "• Use specific concrete details: numbers, timeframes, a mistake, a small realisation. Concrete beats abstract.",
    voiceRule,
    "• The complete sentence should read out loud like something said to a friend after a hard week — not a caption.",
    "• Length: total sentence 30–44 words across 9–14 beats. Never a single word per beat unless it lands like a hammer.",
    "• The reel MUST be about today's specific product/topic below. Do not fall back to a generic mindset hook.",
    "",
    "BEAT / SCRIPT RULES (this is how the reel renders):",
    "• Split the sentence into 9–14 beats that read together as one continuous thought when watched in sequence.",
    "• Each beat has a `layout`:",
    "    - \"single\": one line, centered, hero-sized. Use for a punchy word or short phrase.",
    "    - \"stack\": 2–3 lines with SIZE CONTRAST. Small connective words (\"the\", \"of\", \"but if\", \"over\", \"is\") get size:\"small\"; the meaty noun/verb gets size:\"hero\".",
    "• Aim for a rhythm: mix single beats with stack beats. Do NOT make every beat a stack; do NOT make every beat a single.",
    "• `hold` is a relative weight (0.7 = quick beat, 1.0 = normal, 1.5 = lingering emphasis). Give punchline beats more hold.",
    "• Preserve punctuation on the final beat (period, question mark).",
    "",
    "OUTPUT — STRICT JSON only, no prose, no markdown fences. Schema:",
    '{"hook": string, "caption": string, "hashtags": string[], "script": [{ "layout": "single"|"stack", "lines": [{"text": string, "size": "small"|"hero"}], "hold": number }]}',
    "",
    "`hook` = the full sentence joined (for the reels table + social caption). `script` = the on-screen beats.",
  ].join("\n");

  const user = [
    `Brand: ${input.brandName}`,
    input.knowledgeBase ? `Brand voice / positioning / audience:\n${input.knowledgeBase}` : "",
    input.product
      ? `TODAY'S PRODUCT / TOPIC (the reel MUST be about this — not a generic mindset hook):\n${JSON.stringify(input.product)}`
      : "No product row provided — write a brand-voice mindset hook.",
    `Voice for this reel: ${voice === "you" ? "second-person (you/your)" : "first-person (I/we)"}`,
    `Creative seed (pick a fresh angle, don't repeat prior reels): ${Math.floor(Math.random() * 1e9)}`,
    "Write one full-sentence reel now, as JSON, matching every rule above.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.95,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`AI gateway ${res.status}`);
    const j = await res.json();
    const parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
    const beats = Array.isArray(parsed.script) ? parsed.script : [];
    const cleanBeats: ScriptBeat[] = beats
      .map((b: unknown) => {
        const raw = b as { layout?: string; lines?: Array<{ text?: string; size?: string }>; hold?: number };
        const layout = raw.layout === "stack" ? "stack" : "single";
        const lines = Array.isArray(raw.lines)
          ? raw.lines
              .map((l) => ({
                text: String(l?.text ?? "").trim(),
                size: (l?.size === "small" ? "small" : "hero") as "small" | "hero",
              }))
              .filter((l) => l.text.length > 0)
          : [];
        return { layout, lines, hold: typeof raw.hold === "number" ? raw.hold : 1 } as ScriptBeat;
      })
      .filter((b: ScriptBeat) => b.lines.length > 0);
    if (cleanBeats.length < 3) return fallback;
    return {
      hook: String(parsed.hook ?? "").slice(0, 500) || cleanBeats.map((b) => b.lines.map((l) => l.text).join(" ")).join(" "),
      caption: String(parsed.caption ?? "").slice(0, 1000),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map((t: unknown) => String(t)).slice(0, 12) : [],
      script: cleanBeats,
    };
  } catch {
    return fallback;
  }
}

/**
 * Duration is derived from the beat weights so every beat gets room to breathe.
 * Clamped 20–25s for complete story-style hooks.
 */
export function computeDurationSeconds(script: ScriptBeat[]): number {
  const totalHold = script.reduce((sum, b) => sum + Math.max(0.6, b.hold ?? 1), 0);
  const seconds = Math.round(totalHold * 1.55);
  return Math.max(20, Math.min(25, seconds));
}

function buildReferenceQualityPlan(input: {
  templateId: LockedTemplateId;
  script: ScriptBeat[];
  brandFonts: { display: string; body: string };
  durationSeconds: number;
  analyzedReferenceCount: number;
  recentTemplates: string[];
}) {
  const wordCount = input.script.reduce(
    (sum, beat) => sum + beat.lines.reduce((lineSum, line) => lineSum + line.text.split(/\s+/).filter(Boolean).length, 0),
    0,
  );
  const stackRatio = input.script.length
    ? input.script.filter((beat) => beat.layout === "stack").length / input.script.length
    : 0;
  const referenceName = input.templateId === "motion-poster" ? "yp.motionstudio" : "rendyr.video";
  const checklist =
    input.templateId === "motion-poster"
      ? [
          "hard-cut full-screen primary/accent poster fields",
          "top-center Instagram handle watermark",
          "single hero phrases mixed with small/HUGE/small stacks",
          "no caption text inside the video",
          "brand display font is the only typography source",
        ]
      : [
          "hard-cut accent/background editorial fields",
          "top-center text watermark",
          "kicker plus hero hierarchy with generous centered empty space",
          "no caption text inside the video",
          "brand display font is the only typography source",
        ];
  const warnings = [
    wordCount < 28 ? `script may be too short for a 20–25s story (${wordCount} words)` : null,
    input.script.length < 8 ? `too few on-screen beats (${input.script.length})` : null,
    stackRatio < 0.25 ? "not enough hierarchy stacks; output can feel like plain text on background" : null,
    !input.brandFonts.display ? "missing display font; renderer will fall back" : null,
  ].filter(Boolean) as string[];

  return {
    version: "reference-quality-v1" as const,
    referenceName,
    selectedTemplate: input.templateId,
    analyzedReferenceCount: input.analyzedReferenceCount,
    durationSeconds: input.durationSeconds,
    wordCount,
    beatCount: input.script.length,
    stackRatio: Number(stackRatio.toFixed(2)),
    displayFont: input.brandFonts.display,
    recentTemplates: input.recentTemplates,
    checklist,
    warnings,
  };
}

/** Heuristic fallback: break a plain hook into beats when copywriter didn't emit a script. */
function deriveScriptFromHook(hook: string): ScriptBeat[] {
  const parts = hook
    .replace(/[""'']/g, "")
    .split(/[,;:.!?—–]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const source = parts.length ? parts : [hook];
  return source.slice(0, 11).map<ScriptBeat>((phrase) => {
    const words = phrase.split(/\s+/).filter(Boolean);
    if (words.length <= 2) return { layout: "single", lines: [{ text: phrase, size: "hero" }], hold: 1 };
    const kicker = words.slice(0, Math.max(1, Math.floor(words.length / 3))).join(" ");
    const hero = words.slice(Math.max(1, Math.floor(words.length / 3))).join(" ");
    return {
      layout: "stack",
      lines: [
        { text: kicker, size: "small" },
        { text: hero, size: "hero" },
      ],
      hold: 1,
    };
  });
}

type ReferenceBrief = { label: string | null; notes: string | null; analysis?: Record<string, unknown> | null };


function fallbackStylePlan(hook: string, seed: number): TypographyStylePlan {
  const phrases = hook
    .replace(/[“”"]/g, "")
    .split(/[,;:.!?—–]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const source = phrases.length ? phrases : [hook];
  const layouts = ["center-stack", "upper-left", "poster-block", "lower-left", "split-left"] as const;
  return {
    version: "primitive-typography-v1",
    composition: {
      canvasMood: seed % 3 === 0 ? "minimal" : seed % 3 === 1 ? "editorial" : "bold-poster",
      backgroundMode: seed % 4 === 0 ? "framed-negative-space" : seed % 4 === 1 ? "accent-band" : "solid",
      safeMargin: 90,
    },
    typography: { casing: "as-written", displayWeight: 900, supportWeight: 650, tracking: 0, lineHeight: 0.94 },
    beats: source.slice(0, 6).map((text, index) => {
      const words = text.split(/\s+/).filter(Boolean);
      const hero = chooseSemanticHero(words);
      const start = words.findIndex((w) => cleanWord(w) === cleanWord(hero[0]));
      return {
        text,
        hero,
        supportBefore: start > 0 ? words.slice(0, start).join(" ") : "",
        supportAfter: start >= 0 ? words.slice(start + hero.length).join(" ") : "",
        emphasis: index === 0 ? "strong" : hero.length > 1 ? "hero" : "normal",
        layout: layouts[(seed + index) % layouts.length],
        align: layouts[(seed + index) % layouts.length].includes("left") ? "left" : "center",
        holdWeight: 1 + Math.min(words.length, 8) * 0.06,
        colorRole: index % 3 === 1 ? "invert" : index % 3 === 2 ? "accent-bg" : "base",
        emptySpace: index % 2 ? "wide" : "balanced",
        transition: index % 4 === 0 ? "pop" : index % 4 === 1 ? "settle" : index % 4 === 2 ? "wipe" : "slide",
      } satisfies TypographyStylePlan["beats"][number];
    }),
  };
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "for",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "you",
  "your",
  "this",
  "that",
]);

function cleanWord(word: string) {
  return word.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function chooseSemanticHero(words: string[]) {
  if (words.length <= 2) return words;
  let best = 0;
  let score = -Infinity;
  words.forEach((word, index) => {
    const bare = cleanWord(word);
    const next = cleanWord(words[index + 1] ?? "");
    const s = (STOP_WORDS.has(bare) ? -4 : bare.length) + (/\d/.test(bare) ? 3 : 0) + index * 0.18 + (next.length >= 5 ? 1 : 0);
    if (s > score) {
      score = s;
      best = index;
    }
  });
  const next = words[best + 1];
  if (next && !STOP_WORDS.has(cleanWord(next)) && cleanWord(next).length >= 5 && words.length > 4) {
    return [words[best], next];
  }
  return [words[best]];
}

async function generateStylePlan(input: {
  hook: string;
  brandName: string;
  knowledgeBase: string | null;
  references: ReferenceBrief[];
  seed: number;
}): Promise<TypographyStylePlan> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return fallbackStylePlan(input.hook, input.seed);

  // Build a compact, high-priority summary from the vision-analyzed references.
  // The planner is instructed to MATCH this design language, not invent one.
  const visionAnalyses = input.references
    .map((r) => r.analysis)
    .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === "object"));

  const referenceLanguage = visionAnalyses.length
    ? [
        `You have ${visionAnalyses.length} vision-analyzed reference reel(s). MATCH their design language.`,
        "Aggregate visual language across references (majority vote on each dimension):",
        ...visionAnalyses.map((a, i) => `Ref ${i + 1}: ${JSON.stringify(a)}`),
      ].join("\n")
    : input.references.length
      ? `Reference vault heuristic notes:\n${input.references.map((r, i) => `${i + 1}. ${r.label ?? "ref"}${r.notes ? ` — ${r.notes}` : ""}`).join("\n")}`
      : "No references. Default to clean editorial hierarchy with intentional empty space.";

  const sys = [
    "You are a senior motion-design director. Your job is to reverse-engineer the DESIGN LANGUAGE of the user's reference reels and generate a fresh, non-templated beat plan that feels like it belongs in the same visual universe.",
    "You are NOT copying frames or captions. You are extracting reusable design intelligence: hierarchy, pacing, empty space, emphasis, casing, motion restraint, palette usage.",
    "Return a design primitive plan for a 1080x1920 short-form reel.",
    "HARD RULES:",
    "- Hero can be 1 word, 2 words, or a full phrase — choose based on the sentence's meaning, not a fixed rule.",
    "- Layout is intentional: centered, upper-left, lower-left, split-left, right-rail, full-phrase, or poster-block. Vary across beats to create rhythm.",
    "- Motion transitions: settle/pop/wipe/slide/cut ONLY. Never chaotic (no spin/shake/blur).",
    "- Empty space is a design element. Do not fill the frame by default.",
    "- Pacing: important beats hold longer (holdWeight up to 1.8). Setup beats can be quicker (0.7-0.9).",
    "- Match the reference language above: casing, weight, typography hierarchy, motion restraint, layout preference, palette usage.",
    "- Never emit social captions or hashtags into the plan. Only the hook is on screen.",
    "Output STRICT JSON matching this shape:",
    '{"version":"primitive-typography-v1","composition":{"canvasMood":"editorial|bold-poster|minimal|saas-clean|creator-caption","backgroundMode":"solid|split-field|framed-negative-space|accent-band|soft-panel","safeMargin":90},"typography":{"casing":"as-written|uppercase|title","displayWeight":900,"supportWeight":650,"tracking":0,"lineHeight":0.94},"beats":[{"text":"phrase","hero":["word or phrase parts"],"supportBefore":"","supportAfter":"","emphasis":"quiet|normal|strong|hero","layout":"center-stack|upper-left|lower-left|split-left|right-rail|full-phrase|poster-block","align":"center|left|right","holdWeight":1,"colorRole":"base|invert|accent-bg|primary-bg","emptySpace":"balanced|top-heavy|bottom-heavy|wide","transition":"settle|pop|wipe|cut|slide"}]}',
  ].join("\n");

  const user = [
    `Brand: ${input.brandName}`,
    input.knowledgeBase ? `Brand voice / instructions:\n${input.knowledgeBase}` : "",
    `Hook to design:\n${input.hook}`,
    `REFERENCE VISUAL LANGUAGE (obey this):\n${referenceLanguage}`,
    `Creative seed: ${input.seed}`,
    "Split the hook by MEANING into 3-7 beats. Vary layout across beats. Give powerful lines more hold weight. Return the JSON now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.82,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`AI gateway ${res.status}`);
    const j = await res.json();
    const parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
    return z
      .object({
        version: z.literal("primitive-typography-v1"),
        composition: z
          .object({
            canvasMood: z.enum(["editorial", "bold-poster", "minimal", "saas-clean", "creator-caption"]).optional(),
            backgroundMode: z.enum(["solid", "split-field", "framed-negative-space", "accent-band", "soft-panel"]).optional(),
            safeMargin: z.number().optional(),
          })
          .optional(),
        typography: z
          .object({
            casing: z.enum(["as-written", "uppercase", "title"]).optional(),
            displayWeight: z.number().optional(),
            supportWeight: z.number().optional(),
            tracking: z.number().optional(),
            lineHeight: z.number().optional(),
          })
          .optional(),
        beats: z
          .array(
            z.object({
              text: z.string().min(1),
              hero: z.array(z.string().min(1)).min(1).max(5),
              supportBefore: z.string().optional(),
              supportAfter: z.string().optional(),
              emphasis: z.enum(["quiet", "normal", "strong", "hero"]).optional(),
              layout: z.enum(["center-stack", "upper-left", "lower-left", "split-left", "right-rail", "full-phrase", "poster-block"]).optional(),
              align: z.enum(["center", "left", "right"]).optional(),
              holdWeight: z.number().optional(),
              colorRole: z.enum(["base", "invert", "accent-bg", "primary-bg"]).optional(),
              emptySpace: z.enum(["balanced", "top-heavy", "bottom-heavy", "wide"]).optional(),
              transition: z.enum(["settle", "pop", "wipe", "cut", "slide"]).optional(),
            }),
          )
          .min(1)
          .max(7),
      })
      .parse(parsed);
  } catch {
    return fallbackStylePlan(input.hook, input.seed);
  }
}

const MOTION_VARIANTS = ["stagger", "cascade", "bounce", "mask", "shuffle", "swing"] as const;

/**
 * Enqueue + dispatch a render for a brand. Copy is AI-generated from the
 * brand's knowledge base — callers no longer supply the hook.
 */
export const renderNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        brand_id: z.string().uuid(),
        hook: z.string().min(1).max(200).optional(),
        caption: z.string().max(1000).optional(),
        template_id: z.enum(["motion-poster", "bold-editorial", "alternate"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: brand, error: brandErr } = await supabase
      .from("brands")
      .select(
        "id, name, template_id, brand_colors, brand_fonts, logo_url, knowledge_base, reference_reel_url, google_sheet_url, google_sheet_id, sheet_tab",
      )
      .eq("id", data.brand_id)
      .maybeSingle();
    if (brandErr) throw new Error(brandErr.message);
    if (!brand) throw new Error("Brand not found");

    // Template selection: the button can pass the currently selected card, so
    // users do not have to remember to hit Save before rendering a test reel.
    const requestedTemplate = data.template_id ?? brand.template_id ?? "alternate";
    const { data: recentTemplateRows } = await supabase
      .from("render_jobs")
      .select("template_id")
      .eq("brand_id", brand.id)
      .order("created_at", { ascending: false })
      .limit(6);
    const recentTemplates = (recentTemplateRows ?? []).map((row) => String(row.template_id));
    let templateId: LockedTemplateId;
    if (isLockedTemplateId(requestedTemplate)) {
      templateId = requestedTemplate;
    } else {
      const lastLocked = recentTemplates.find(isLockedTemplateId) as LockedTemplateId | undefined;
      templateId = lastLocked ? oppositeTemplate(lastLocked) : LOCKED_TEMPLATE_IDS[0];
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Rotate through the brand's product database (Google Sheet). Fetches
    // published-CSV, filters against products_consumed, picks the next unused
    // row, and records consumption so subsequent reels advance to new topics.
    const pickedProduct = await pickNextProduct(supabaseAdmin, {
      brandId: brand.id,
      sheetUrl: brand.google_sheet_url,
      sheetId: brand.google_sheet_id,
      sheetTab: brand.sheet_tab,
    });

    // Alternate voice run-over-run so the feed doesn't feel one-note. Also
    // let the AI pick when there's no history to lean on.
    const { data: recentReels } = await supabase
      .from("reels")
      .select("hook")
      .eq("brand_id", brand.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const lastHook = recentReels?.[0]?.hook ?? "";
    const lastWasYou = /\b(you|your|you're|you've|you'll)\b/i.test(lastHook);
    const voice: "you" | "i-we" = lastHook ? (lastWasYou ? "i-we" : "you") : Math.random() < 0.5 ? "you" : "i-we";

    // Auto-generate copy unless caller passed one in.
    const copy = data.hook
      ? {
          hook: data.hook,
          caption: data.caption ?? "",
          hashtags: [] as string[],
          script: [] as ScriptBeat[],
        }
      : await generateCopy({
          brandName: brand.name,
          knowledgeBase: brand.knowledge_base,
          product: pickedProduct?.row ?? null,
          voice,
        });

    const { data: reel, error: reelErr } = await supabaseAdmin
      .from("reels")
      .insert({
        brand_id: brand.id,
        hook: copy.hook,
        caption: copy.caption || null,
        hashtags: copy.hashtags,
        template_id: templateId,
        status: "queued",
      })
      .select("id")
      .single();
    if (reelErr) throw new Error(reelErr.message);

    const storagePath = `${userId}/${brand.id}/reels/${reel.id}.mp4`;

    const seed = Math.floor(Math.random() * 1e9);
    const variant = MOTION_VARIANTS[Math.floor(Math.random() * MOTION_VARIANTS.length)];
    const { data: refs } = await supabase
      .from("brand_references")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("label, notes, analysis" as any)
      .eq("brand_id", brand.id)
      .order("created_at", { ascending: false })
      .limit(15);
    const referenceBriefs: ReferenceBrief[] = [
      ...(brand.reference_reel_url ? [{ label: "original reference reel", notes: "Primary visual direction reference", analysis: null }] : []),
      ...((refs ?? []) as unknown as ReferenceBrief[]),
    ];
    // Keep stylePlan for backward-compat with the legacy kinetic-type template.
    const stylePlan = await generateStylePlan({
      hook: copy.hook,
      brandName: brand.name,
      knowledgeBase: brand.knowledge_base,
      references: referenceBriefs,
      seed,
    });

    // Script drives on-screen beats. Fallback to a heuristic split if empty.
    const script: ScriptBeat[] =
      copy.script && copy.script.length ? copy.script : deriveScriptFromHook(copy.hook);
    const durationSeconds = computeDurationSeconds(script);
    const durationInFrames = durationSeconds * 30;
    const brandFonts = { ...DEFAULT_FONTS, ...((brand.brand_fonts as { display?: string; body?: string } | null) ?? {}) };
    const analyzedReferenceCount = referenceBriefs.filter((r) => r.analysis).length;
    const qualityPlan = buildReferenceQualityPlan({
      templateId,
      script,
      brandFonts,
      durationSeconds,
      analyzedReferenceCount,
      recentTemplates,
    });

    const props: RenderProps = {
      hook: copy.hook,
      script,
      seed,
      variant,
      stylePlan,
      qualityPlan,
      handle: brand.name ? `@${brand.name}` : null,
      brand: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        colors: { ...DEFAULT_COLORS, ...((brand.brand_colors as any) ?? {}) },
        fonts: brandFonts,
        logoUrl: brand.logo_url,
      },
    };

    // Persist duration on props so dispatch (which reads from DB for retries)
    // knows how long to render. Worker reads job.durationInFrames from top of payload.
    const propsWithDuration = { ...props, durationInFrames };


    const { data: job, error: jobErr } = await supabaseAdmin
      .from("render_jobs")
      .insert({
        brand_id: brand.id,
        reel_id: reel.id,
        template_id: templateId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        props: propsWithDuration as any,
        storage_path: storagePath,
        status: "queued",
        max_attempts: MAX_ATTEMPTS,
      })
      .select("id")
      .single();
    if (jobErr) throw new Error(jobErr.message);

    await supabaseAdmin.from("reels").update({ render_job_id: job.id }).eq("id", reel.id);
    await appendLog(supabaseAdmin, job.id, {
      level: "info",
      stage: "enqueue",
      message: `job created: "${copy.hook}" — ${durationSeconds}s — template=${templateId} (${analyzedReferenceCount} analyzed refs)`,
    });
    await appendLog(supabaseAdmin, job.id, {
      level: qualityPlan.warnings.length ? "warn" : "info",
      stage: "quality_audit",
      message: `${qualityPlan.referenceName} lock: ${qualityPlan.beatCount} beats, ${qualityPlan.wordCount} words, stackRatio=${qualityPlan.stackRatio}, font=${qualityPlan.displayFont}${qualityPlan.warnings.length ? ` — warnings: ${qualityPlan.warnings.join("; ")}` : ""}`,
    });

    await dispatchJob(supabaseAdmin, {
      id: job.id,
      reel_id: reel.id,
      template_id: templateId,
      props: propsWithDuration,
      storage_path: storagePath,
      attempts: 0,
    });

    return { reel_id: reel.id, job_id: job.id, hook: copy.hook, duration_seconds: durationSeconds, template_id: templateId };
  });

/**
 * Idempotent claim + dispatch. Uses a conditional UPDATE so re-entrant calls
 * for the same job never dispatch twice — only the row currently in "queued"
 * transitions to "rendering", and only that caller submits to the worker.
 */
async function dispatchJob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  job: {
    id: string;
    reel_id: string | null;
    template_id: string;
    props: RenderProps;
    storage_path: string;
    attempts: number;
  },
): Promise<boolean> {
  const nextAttempt = (job.attempts ?? 0) + 1;

  // Atomic claim: only the process that flips queued→rendering proceeds.
  const { data: claimed } = await admin
    .from("render_jobs")
    .update({
      status: "rendering",
      attempts: nextAttempt,
      dispatched_at: new Date().toISOString(),
      worker_url: process.env.VPS_RENDER_URL ?? null,
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    await appendLog(admin, job.id, {
      level: "warn",
      stage: "claim",
      message: "job not in queued state, skipping dispatch (idempotent no-op)",
    });
    return false;
  }

  const origin = process.env.PUBLIC_APP_URL ?? "";
  const callbackUrl = `${origin.replace(/\/$/, "")}/api/public/render/callback`;

  const { data: signed, error: signedErr } = await admin.storage
    .from("brand-assets")
    .createSignedUploadUrl(job.storage_path);
  if (signedErr) {
    await appendLog(admin, job.id, { level: "error", stage: "sign_upload", message: signedErr.message });
    await admin
      .from("render_jobs")
      .update({ status: "queued", last_error: signedErr.message })
      .eq("id", job.id);
    return false;
  }

  // Duration is stashed on props by renderNow. Fall back to 8s for legacy jobs.
  const propsDuration = Number(
    (job.props as unknown as { durationInFrames?: number })?.durationInFrames,
  );
  const durationInFrames = Number.isFinite(propsDuration) && propsDuration >= 60 ? propsDuration : 240;

  const payload: RenderJobPayload = {
    jobId: job.id,
    templateId: job.template_id,
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames,
    props: job.props,
    upload: { signedUrl: signed.signedUrl, path: job.storage_path },
    supabase: {
      url: process.env.SUPABASE_URL!,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      reelId: job.reel_id,
      storagePath: job.storage_path,
      signedUrlExpiresIn: 60 * 60 * 24 * 7,
    },
    callback: { url: callbackUrl, hmacKeyId: "v1" },
  };

  try {
    await getRenderService().submit(payload);
    if (job.reel_id) {
      await admin.from("reels").update({ status: "rendering" }).eq("id", job.reel_id);
    }
    await appendLog(admin, job.id, {
      level: "info",
      stage: "dispatch",
      message: `submitted to worker (attempt ${nextAttempt}/${MAX_ATTEMPTS})`,
    });
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const permanent = nextAttempt >= MAX_ATTEMPTS;
    await appendLog(admin, job.id, {
      level: "error",
      stage: "dispatch",
      message: `submit failed: ${message}`,
    });
    await admin
      .from("render_jobs")
      .update({
        status: permanent ? "failed" : "queued",
        last_error: message,
        completed_at: permanent ? new Date().toISOString() : null,
      })
      .eq("id", job.id);
    if (permanent && job.reel_id) {
      await admin.from("reels").update({ status: "failed", error: message }).eq("id", job.reel_id);
    }
    return false;
  }
}

/**
 * Drain queued jobs — called by cron. Also recovers jobs that failed
 * transiently but still have attempts left.
 */
export const drainRenderQueue = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: jobs } = await supabaseAdmin
    .from("render_jobs")
    .select("id, reel_id, template_id, props, storage_path, attempts, max_attempts")
    .eq("status", "queued")
    .lt("attempts", MAX_ATTEMPTS)
    .limit(20);

  if (!jobs || jobs.length === 0) return { dispatched: 0 };

  let dispatched = 0;
  for (const j of jobs) {
    if (!j.storage_path) continue;
    const ok = await dispatchJob(supabaseAdmin, {
      id: j.id,
      reel_id: j.reel_id,
      template_id: j.template_id,
      props: j.props as unknown as RenderProps,
      storage_path: j.storage_path,
      attempts: j.attempts ?? 0,
    });
    if (ok) dispatched++;
  }
  return { dispatched };
});
