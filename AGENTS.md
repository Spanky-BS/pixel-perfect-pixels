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
- Supplier/Bexio tables exist as structure only; no integration code until that phase.
- Customer invoices (`customer_invoices`) store their lines as a JSON snapshot so a sent PDF never changes; amounts/numbering/QR data live in `src/lib/customer-invoice.ts` (pure, tested).
- PDFs are rendered client-side with html2pdf.js; `html2canvas` is overridden to `html2canvas-pro` in package.json because Tailwind v4 oklch colours make plain html2canvas hang.
- Sending documents goes through `sendPdfByMail` (`src/lib/mail.ts`): native share with the PDF attached, else download + prefilled mailto, so a later mail provider can replace one function.

- Jobs have `job_type` (project|service); status steps per type live in `src/lib/app.ts` (`stepsFor`), legacy project statuses are mapped via `normalizeStatus` instead of rewriting rows.
- Project AI analysis runs from the Grobkosten step and applies results directly (no review step); answers to open questions are stored as text notes so the next incremental AI run picks them up without schema changes.
- Never ignore `.env` in `.gitignore`: it holds only public connection values, and published builds lose the backend connection (blank screen) without it.
- Offerte, Ausführung and Rechnung share one rubric structure from `src/lib/rubrics.ts` (BKP 25 codes); rows store `rubric`, untagged rows are classified by text via `guessRubric`, so old data needs no backfill.
- Supplier catalogue search (Richner, ENGEL, Pestalozzi; Sanitas prepared) runs server-side in `src/lib/suppliers/catalog.server.ts` with pure, tested parsers in `catalog.ts`; a picked article is snapshotted as a `products` row so later shop price changes never alter a quote.
