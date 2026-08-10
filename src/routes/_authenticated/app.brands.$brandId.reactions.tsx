import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { getBrand } from "@/lib/brands.functions";
import { ReactionAssetLibrary } from "@/components/reaction/ReactionAssetLibrary";
import { ReactionReelsPanel } from "@/components/reaction/ReactionReelsPanel";

export const Route = createFileRoute("/_authenticated/app/brands/$brandId/reactions")({
  component: ReactionsPage,
  head: () => ({
    meta: [
      { title: "Reaction + Demo Reels — Reelforge" },
      {
        name: "description",
        content:
          "Build reaction + product-demo reels from your own clip library. AI tags every clip and pairs compatible reactions with demos automatically.",
      },
      { property: "og:title", content: "Reaction + Demo Reels — Reelforge" },
      {
        property: "og:description",
        content: "An AI-paired reaction and product-demo reel engine built on your own asset library.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function ReactionsPage() {
  const { brandId } = Route.useParams();
  const fetchBrand = useServerFn(getBrand);
  const { data } = useQuery({
    queryKey: ["brand-basics", brandId],
    queryFn: () => fetchBrand({ data: { id: brandId } }),
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <Link
        to="/app/brands/$brandId"
        params={{ brandId }}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to {data?.brand?.name ?? "brand"}
      </Link>

      <header className="space-y-1">
        <h1 className="font-display text-3xl font-semibold">Reaction + Demo Reels</h1>
        <p className="text-muted-foreground">
          A separate format from your typography reels. Upload reaction clips and short product demos — AI understands
          each clip, pairs compatible combinations, and writes one curiosity-driven line per reel.
        </p>
      </header>

      <ReactionAssetLibrary brandId={brandId} />
      <ReactionReelsPanel brandId={brandId} />
    </div>
  );
}
