import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { getBrand } from "@/lib/brands.functions";
import { BRollAssetLibrary } from "@/components/broll/BRollAssetLibrary";
import { BRollReelsPanel } from "@/components/broll/BRollReelsPanel";

export const Route = createFileRoute("/_authenticated/app/brands/$brandId_/broll")({
  component: BrollPage,
  head: () => ({
    meta: [
      { title: "BROLL VIDS — Reelforge" },
      { name: "description", content: "Create short B-roll reels using your brand's video clips and one-time hook lines." },
      { property: "og:title", content: "BROLL VIDS — Reelforge" },
      { property: "og:description", content: "Rotate your B-roll clips and unique hook lines into ready-to-download reels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function BrollPage() {
  const { brandId } = Route.useParams();
  const fetchBrand = useServerFn(getBrand);
  const { data } = useQuery({
    queryKey: ["brand-basics", brandId],
    queryFn: () => fetchBrand({ data: { id: brandId } }),
  });

  return (
    <main className="mx-auto w-full max-w-6xl space-y-7 px-4 py-8">
      <Link to="/app/brands/$brandId" params={{ brandId }} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to {data?.brand?.name ?? "brand"}
      </Link>
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-semibold">BROLL VIDS</h1>
        <p className="text-muted-foreground">{data?.brand?.name ?? "Brand clips"} · rotating clips with one-use hook lines</p>
      </header>
      <BRollAssetLibrary brandId={brandId} />
      <BRollReelsPanel brandId={brandId} />
    </main>
  );
}