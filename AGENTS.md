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
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate); data is read/written from the browser client with RLS, no server functions needed yet.
- Photos and voice audio go in the private `job-media` bucket under `<user_id>/<job_id>/`, shown via signed URLs.
- New users get settings + default material categories from the `handle_new_user` trigger.
- Supplier, quotation and Bexio tables are intentionally not created yet (later phase).
