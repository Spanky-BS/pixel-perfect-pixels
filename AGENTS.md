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

## Project rules
- All app data is per-user (`user_id = auth.uid()` RLS on every table) so more users can be added later without schema changes.
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate); data is read/written from the browser client with RLS, except AI analysis, which runs in a server function (`src/lib/ai.functions.ts`) so the AI key stays server-side.
- Photos and voice audio go in the private `job-media` bucket under `<user_id>/<job_id>/`, shown via signed URLs.
- New users get settings + default material categories from the `handle_new_user` trigger.
- Supplier/quotation/Bexio tables exist as structure only; no integration code until that phase.

- Jobs have `job_type` (project|service); status steps per type live in `src/lib/app.ts` (`stepsFor`), legacy project statuses are mapped via `normalizeStatus` instead of rewriting rows.
- Project AI analysis runs from the Grobkosten step and applies results directly (no review step); answers to open questions are stored as text notes so the next incremental AI run picks them up without schema changes.
- Never ignore `.env` in `.gitignore`: it holds only public connection values, and published builds lose the backend connection (blank screen) without it.
