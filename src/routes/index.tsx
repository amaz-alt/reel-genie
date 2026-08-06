import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, CalendarClock, Wand2, Share2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reelforge Automated Reel Generator" },
      {
        name: "description",
        content: "Create on-brand short-form reels from product sheets, render MP4s, and publish them through connected social accounts.",
      },
      { property: "og:title", content: "Reelforge Automated Reel Generator" },
      {
        property: "og:description",
        content: "Create on-brand short-form reels from product sheets, render MP4s, and publish them through connected social accounts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/reelforge-icon.png" alt="" width={30} height={30} className="size-[30px] rounded-md" />
          <span className="font-display text-lg font-semibold">Reelforge</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link to="/auth" className="text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            Get started <ArrowRight className="size-3.5" />
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="pt-20 pb-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-accent" /> Automated short-form reels, on brand, every day
          </div>
          <h1 className="mt-6 max-w-4xl text-5xl leading-[1.05] font-display font-semibold md:text-7xl">
            One template. <span className="text-accent">Endless reels.</span>
            <br />
            Zero manual editing.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Attach your product sheet, pick a template, drop in a brand voice. Reelforge writes the
            hook, renders a 1080×1920 reel, and posts it on your schedule — for every brand you run.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-3 text-primary-foreground hover:bg-primary/90"
            >
              Start your first brand <ArrowRight className="size-4" />
            </Link>
            <a
              href="#how"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-5 py-3 hover:bg-secondary"
            >
              How it works
            </a>
          </div>
        </section>

        <section id="how" className="grid gap-6 py-8 md:grid-cols-3">
          {[
            {
              icon: CalendarClock,
              title: "Set the cadence",
              body:
                "Pick the days and time each brand should post. A daily cron picks up whatever is due.",
            },
            {
              icon: Wand2,
              title: "Generate the copy",
              body:
                "AI writes a tight hook (≤12 words), a caption, and relevant hashtags from your Knowledge Base and the next unused product row.",
            },
            {
              icon: Share2,
              title: "Render and publish",
              body:
                "Your chosen template renders a 9:16 MP4 with your fonts and colors, then Outstand publishes it to every connected account.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-6">
              <Icon className="size-5 text-accent" />
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>

        <footer className="mt-24 border-t border-border py-8 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Reelforge
        </footer>
      </main>
    </div>
  );
}
