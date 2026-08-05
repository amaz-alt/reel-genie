import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/account")({
  head: () => ({
    meta: [
      { title: "Account settings — Reelforge" },
      {
        name: "description",
        content: "Update your Reelforge account password and manage your sign-in details.",
      },
      { property: "og:title", content: "Account settings — Reelforge" },
      {
        property: "og:description",
        content: "Update your Reelforge account password and manage your sign-in details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      setPassword("");
      setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setLoading(false);
    }
  }

  async function sendResetLink() {
    setSending(true);
    try {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      if (!email) throw new Error("No email on this account");
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (error) throw error;
      toast.success("Reset link sent to your email");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset link");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-3xl font-semibold">Account</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage how you sign in to Reelforge.</p>

      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <KeyRound className="size-4 text-accent" /> Change password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-3">
            <div>
              <Label htmlFor="acc-password">New password</Label>
              <Input
                id="acc-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="acc-confirm">Confirm new password</Label>
              <Input
                id="acc-confirm"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Update password
              </Button>
              <Button type="button" variant="ghost" onClick={sendResetLink} disabled={sending}>
                {sending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Email me a reset link
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
