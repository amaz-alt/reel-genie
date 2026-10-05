<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep B-roll Vids isolated in its own route, server functions, records, and Remotion composition; it may use the shared render worker, but must not change Typography or Reaction + Demo behavior because the three content formats have separate workflows and quality rules. Pass B-roll-only render tuning explicitly in each job payload so other formats retain their existing worker settings.
