import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  listBrandSocialAccounts,
  listOutstandAccounts,
  setBrandOutstandAccounts,
  type OutstandAccount,
} from "@/lib/outstand.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, RefreshCw, Save, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const NETWORK_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  youtube: "YouTube",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X",
  threads: "Threads",
  google_business: "Google Business",
  vimeo: "Vimeo",
  bluesky: "Bluesky",
};

export function BrandSocialAccounts({ brandId }: { brandId: string }) {
  const qc = useQueryClient();

  const linkedQ = useQuery({
    queryKey: ["brand-social-accounts", brandId],
    queryFn: () => listBrandSocialAccounts({ data: { brand_id: brandId } }),
  });

  const outstandQ = useQuery({
    queryKey: ["outstand-accounts"],
    queryFn: () => listOutstandAccounts(),
    staleTime: 30_000,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Seed selection from currently linked accounts once both queries loaded.
  useEffect(() => {
    if (initialized) return;
    if (!linkedQ.data) return;
    setSelected(new Set(linkedQ.data.map((a) => a.outstand_account_id)));
    setInitialized(true);
  }, [linkedQ.data, initialized]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const map = new Map<string, OutstandAccount>();
      (outstandQ.data ?? []).forEach((a) => map.set(a.id, a));
      const accounts = Array.from(selected)
        .map((id) => map.get(id))
        .filter((a): a is OutstandAccount => Boolean(a))
        .map((a) => ({
          outstand_account_id: a.id,
          network: a.network,
          username: a.username,
          nickname: a.nickname,
          network_unique_id: a.network_unique_id,
        }));
      return setBrandOutstandAccounts({ data: { brand_id: brandId, accounts } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-social-accounts", brandId] });
      toast.success("Accounts saved");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    },
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const accounts = outstandQ.data ?? [];
  // Group by network for a cleaner list.
  const grouped = accounts.reduce<Record<string, OutstandAccount[]>>((acc, a) => {
    (acc[a.network] ??= []).push(a);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="font-display text-lg">Social accounts</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => outstandQ.refetch()}
          disabled={outstandQ.isFetching}
        >
          {outstandQ.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          These are the accounts connected in your Outstand workspace. Tick the ones this brand
          should publish to — the schedule will post only to selected accounts. Pinterest pins use
          the product URL + a short AI caption.
        </p>

        {outstandQ.isLoading || linkedQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
          </div>
        ) : outstandQ.error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 text-destructive" />
            <div>
              <div className="font-medium">Couldn't reach Outstand</div>
              <div className="text-muted-foreground">
                {outstandQ.error instanceof Error ? outstandQ.error.message : "Unknown error"}
              </div>
            </div>
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No accounts connected in Outstand yet. Connect them inside your Outstand dashboard,
            then click Refresh.
          </div>
        ) : (
          <div className="rounded-md border divide-y max-h-[420px] overflow-y-auto">
            {Object.keys(grouped)
              .sort()
              .map((network) => (
                <div key={network} className="p-2">
                  <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {NETWORK_LABEL[network] ?? network}
                  </div>
                  {grouped[network].map((a) => {
                    const checked = selected.has(a.id);
                    return (
                      <label
                        key={a.id}
                        className="flex items-center gap-3 px-2 py-2 rounded hover:bg-muted/40 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(a.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">
                            {network} @{a.username ?? a.nickname ?? a.id}
                          </div>
                          {a.nickname && a.username && a.nickname !== a.username ? (
                            <div className="text-xs text-muted-foreground truncate">
                              {a.nickname}
                            </div>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            <Badge variant="secondary">
              {selected.size} selected
            </Badge>{" "}
            for this brand
          </div>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !initialized}
            size="sm"
          >
            {saveMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Save className="h-4 w-4 mr-1" /> Save
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
