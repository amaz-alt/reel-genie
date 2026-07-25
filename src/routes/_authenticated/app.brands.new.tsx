import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createBrand, createBrandAssetUploadUrl } from "@/lib/brands.functions";
import { TEMPLATES } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { analyzeReferenceVideo } from "@/lib/reference-analysis";
import { ArrowLeft, ArrowRight, Loader2, Upload, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/brands/new")({
  head: () => ({
    meta: [
      { title: "Create Brand in Reelforge" },
      {
        name: "description",
        content: "Create a Reelforge brand with product data, voice notes, colours, fonts, and a reference reel for automated video generation.",
      },
      { property: "og:title", content: "Create Brand in Reelforge" },
      {
        property: "og:description",
        content: "Create a Reelforge brand with product data, voice notes, colours, fonts, and a reference reel for automated video generation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewBrand,
});

type Colors = { primary: string; accent: string; background: string; text: string };
type Fonts = { display: string; body: string };

function NewBrand() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetTab, setSheetTab] = useState("Sheet1");
  const [knowledgeBase, setKnowledgeBase] = useState("");
  const [templateId, setTemplateId] = useState<string>("alternate");
  const [colors, setColors] = useState<Colors>({
    primary: "#111111",
    accent: "#ff3b30",
    background: "#ffffff",
    text: "#111111",
  });
  const [fonts, setFonts] = useState<Fonts>({ display: "Space Grotesk", body: "Inter" });
  const [logoUrl, setLogoUrl] = useState("");
  const [refReelUrl, setRefReelUrl] = useState("");
  const [refReelPath, setRefReelPath] = useState("");
  const [refReelNotes, setRefReelNotes] = useState("");
  const [uploading, setUploading] = useState<"logo" | "reference_reel" | null>(null);

  const create = useMutation({
    mutationFn: async () =>
      createBrand({
        data: {
          name,
          google_sheet_url: sheetUrl || "",
          sheet_tab: sheetTab,
          sheet_range: "A1:Z1000",
          knowledge_base: knowledgeBase,
          template_id: templateId,
          brand_colors: colors,
          brand_fonts: fonts,
          logo_url: logoUrl || "",
          reference_reel_url: refReelUrl || "",
          reference_reel_path: refReelPath || undefined,
          reference_reel_notes: refReelNotes || undefined,
        },
      }),
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: ["brands"] });
      toast.success("Brand created");
      navigate({ to: "/app/brands/$brandId", params: { brandId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleUpload(file: File, kind: "logo" | "reference_reel") {
    setUploading(kind);
    try {
      const { path, token } = await createBrandAssetUploadUrl({
        data: { filename: file.name, kind },
      });
      const { error } = await supabase.storage
        .from("brand-assets")
        .uploadToSignedUrl(path, token, file);
      if (error) throw error;
      const { data } = await supabase.storage.from("brand-assets").createSignedUrl(path, 60 * 60 * 24 * 365);
      const url = data?.signedUrl ?? "";
      if (kind === "logo") setLogoUrl(url);
      else {
        setRefReelUrl(url);
        setRefReelPath(path);
        const { notes } = await analyzeReferenceVideo(file);
        setRefReelNotes(notes);
      }
      toast.success(`${kind === "logo" ? "Logo" : "Reference reel"} uploaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  const steps = ["Basics", "Product sheet", "Voice", "Style system", "Reference reel"];

  const canNext =
    (step === 0 && name.trim().length > 0) ||
    (step === 1) ||
    (step === 2) ||
    (step === 3) ||
    step === 4;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/app"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Back
      </Link>

      <div className="mb-8 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-xs font-medium",
                i < step
                  ? "bg-primary text-primary-foreground"
                  : i === step
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </div>
            {i < steps.length - 1 ? (
              <div className={cn("h-px flex-1", i < step ? "bg-primary" : "bg-border")} />
            ) : null}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl">{steps[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 && (
            <div>
              <Label htmlFor="name">Brand name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Northwind Coffee"
                autoFocus
              />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="sheet">Google Sheet URL</Label>
                <Input
                  id="sheet"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  In Google Sheets: File → Share → Publish to web → CSV, then paste the sheet URL here.
                  Include columns like <code>name</code>, <code>description</code>, <code>image_url</code>.
                </p>
              </div>
              <div>
                <Label htmlFor="tab">Sheet tab name</Label>
                <Input
                  id="tab"
                  value={sheetTab}
                  onChange={(e) => setSheetTab(e.target.value)}
                  placeholder="Sheet1"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <Label htmlFor="kb">Knowledge base</Label>
              <Textarea
                id="kb"
                rows={10}
                value={knowledgeBase}
                onChange={(e) => setKnowledgeBase(e.target.value)}
                placeholder={
                  "Brand voice, target audience, tone, example hooks you love, standard CTAs, things to avoid…"
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                The AI reads this before writing every hook and caption.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <Label>Render engine</Label>
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      className={cn(
                        "flex overflow-hidden rounded-lg border text-left transition",
                        templateId === t.id
                          ? "border-accent ring-2 ring-accent"
                          : "border-border hover:border-foreground/30",
                      )}
                    >
                      <div className="w-24 shrink-0" style={{ background: t.swatch }} />
                      <div className="p-3">
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-muted-foreground">{t.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {(["primary", "accent", "background", "text"] as const).map((k) => (
                  <div key={k}>
                    <Label htmlFor={`c-${k}`} className="capitalize">
                      {k}
                    </Label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`c-${k}`}
                        type="color"
                        value={colors[k]}
                        onChange={(e) => setColors({ ...colors, [k]: e.target.value })}
                        className="h-9 w-12 rounded border border-input"
                      />
                      <Input
                        value={colors[k]}
                        onChange={(e) => setColors({ ...colors, [k]: e.target.value })}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="f-display">Display font</Label>
                  <Input
                    id="f-display"
                    value={fonts.display}
                    onChange={(e) => setFonts({ ...fonts, display: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="f-body">Body font</Label>
                  <Input
                    id="f-body"
                    value={fonts.body}
                    onChange={(e) => setFonts({ ...fonts, body: e.target.value })}
                  />
                </div>
              </div>

              <UploadField
                label="Logo (optional)"
                url={logoUrl}
                accept="image/*"
                uploading={uploading === "logo"}
                onFile={(f) => handleUpload(f, "logo")}
              />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <UploadField
                label="Reference reel (MP4) — one-time upload"
                url={refReelUrl}
                accept="video/mp4,video/*"
                uploading={uploading === "reference_reel"}
                onFile={(f) => handleUpload(f, "reference_reel")}
              />
              <p className="text-xs text-muted-foreground">
                The reference reel is the design brief. New renders use its visual language through reusable
                layout, hierarchy, timing, transition, and typography primitives.
              </p>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button
              variant="ghost"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
            >
              Back
            </Button>
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
                Next <ArrowRight className="ml-1.5 size-4" />
              </Button>
            ) : (
              <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
                {create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Create brand
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UploadField({
  label,
  url,
  accept,
  uploading,
  onFile,
}: {
  label: string;
  url: string;
  accept: string;
  uploading: boolean;
  onFile: (f: File) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-6 text-sm hover:bg-muted">
        {uploading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Upload className="size-4 text-muted-foreground" />
        )}
        <span className="text-muted-foreground">
          {url ? "Replace file" : "Click to upload"}
        </span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>
      {url ? <p className="mt-1 truncate text-xs text-muted-foreground">Uploaded ✓</p> : null}
    </div>
  );
}
