import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listBrands, deleteBrand } from "@/lib/brands.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, MoreHorizontal, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const brandsQuery = queryOptions({
  queryKey: ["brands"],
  queryFn: () => listBrands(),
});

export const Route = createFileRoute("/_authenticated/app/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(brandsQuery),
  component: Dashboard,
});

function Dashboard() {
  const { data: brands = [] } = useQuery(brandsQuery);
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: (id: string) => deleteBrand({ data: { id } }),
    onSuccess: () => {
      toast.success("Brand deleted");
      qc.invalidateQueries({ queryKey: ["brands"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Your brands</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each brand has its own sheet, schedule, template, and voice.
          </p>
        </div>
        <Link to="/app/brands/new">
          <Button>
            <Plus className="mr-1.5 size-4" /> New brand
          </Button>
        </Link>
      </div>

      {brands.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="rounded-full bg-accent/10 p-3">
              <Plus className="size-5 text-accent" />
            </div>
            <h3 className="font-display text-xl font-semibold">Start your first brand</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Attach a Google Sheet, pick a template, add a Knowledge Base, and Reelforge will start
              posting on the schedule you set.
            </p>
            <Link to="/app/brands/new" className="mt-2">
              <Button>Create brand</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {brands.map((b) => {
            const colors = (b.brand_colors ?? {}) as {
              primary?: string;
              accent?: string;
              background?: string;
            };
            return (
              <Card key={b.id} className="group relative overflow-hidden">
                <div
                  className="h-24"
                  style={{
                    background: `linear-gradient(135deg, ${colors.primary ?? "#111"} 0%, ${
                      colors.accent ?? "#ff3b30"
                    } 100%)`,
                  }}
                />
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="font-display text-xl">
                      <Link to="/app/brands/$brandId" params={{ brandId: b.id }}>
                        {b.name}
                      </Link>
                    </CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to="/app/brands/$brandId" params={{ brandId: b.id }}>
                            Open
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete "${b.name}"? This can't be undone.`)) {
                              del.mutate(b.id);
                            }
                          }}
                        >
                          {del.isPending && del.variables === b.id ? (
                            <Loader2 className="mr-2 size-3.5 animate-spin" />
                          ) : null}
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Template: {b.template_id ?? "not set"}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
