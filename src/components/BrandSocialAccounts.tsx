import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  listBrandSocialAccounts,
  startOutstandConnect,
  disconnectSocialAccount,
  SUPPORTED_NETWORKS,
  type OutstandNetwork,
} from "@/lib/outstand.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plug, Unplug } from "lucide-react";
import { toast } from "sonner";

const NETWORK_LABEL: Record<OutstandNetwork, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  youtube: "YouTube",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X (Twitter)",
  threads: "Threads",
};

export function BrandSocialAccounts({ brandId }: { brandId: string }) {
  const qc = useQueryClient();
  const { data: accounts, isLoading } = useQuery({
    queryKey: ["brand-social-accounts", brandId],
    queryFn: () => listBrandSocialAccounts({ data: { brand_id: brandId } }),
  });

  // Toast on redirect back from Outstand.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("outstand");
    if (!outcome) return;
    const network = params.get("network");
    if (outcome === "connected") {
      toast.success(`${network ? NETWORK_LABEL[network as OutstandNetwork] ?? network : "Account"} connected`);
      qc.invalidateQueries({ queryKey: ["brand-social-accounts", brandId] });
    } else if (outcome === "failed") {
      toast.error(`Connect failed${params.get("reason") ? `: ${params.get("reason")}` : ""}`);
    } else {
      toast.error(`Connect error: ${outcome}`);
    }
    // Clean the query string so refreshes don't re-toast.
    const url = new URL(window.location.href);
    url.searchParams.delete("outstand");
    url.searchParams.delete("network");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", url.toString());
  }, [brandId, qc]);

  const connectMut = useMutation({
    mutationFn: (network: OutstandNetwork) =>
      startOutstandConnect({ data: { brand_id: brandId, network } }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to start connect");
    },
  });

  const disconnectMut = useMutation({
    mutationFn: (id: string) => disconnectSocialAccount({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-social-accounts", brandId] });
      toast.success("Disconnected");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect");
    },
  });

  const connectedByNetwork = new Map<string, typeof accounts extends Array<infer T> ? T : never>();
  (accounts ?? []).forEach((a) => connectedByNetwork.set(a.network, a));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Social accounts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Connect via Outstand. Pinterest posts will use the product URL as the pin link + a short AI caption.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SUPPORTED_NETWORKS.map((net) => {
            const acc = connectedByNetwork.get(net);
            return (
              <div
                key={net}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{NETWORK_LABEL[net]}</div>
                  {acc ? (
                    <div className="text-xs text-muted-foreground truncate">
                      @{acc.username ?? acc.nickname ?? acc.outstand_account_id}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Not connected</div>
                  )}
                </div>
                {acc ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="hidden sm:inline-flex">Connected</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => disconnectMut.mutate(acc.id)}
                      disabled={disconnectMut.isPending}
                    >
                      <Unplug className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => connectMut.mutate(net)}
                    disabled={connectMut.isPending}
                  >
                    {connectMut.isPending && connectMut.variables === net ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plug className="h-4 w-4 mr-1" /> Connect
                      </>
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
