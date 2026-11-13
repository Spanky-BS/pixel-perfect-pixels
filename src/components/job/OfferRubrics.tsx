import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, FileText, Loader2, MoreHorizontal, Plus, Sparkles, Tag, Trash2, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { generateRubricText } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { formatCHF, type Labour, type Material } from "@/lib/app";
import { labourQuoteAmount, linkedProduct } from "@/lib/project-quote";
import { unitSalesPrice } from "@/lib/products";
import { RUBRICS, groupByRubric, rubricOf } from "@/lib/rubrics";
import { addCatalogHitToOffer } from "@/lib/suppliers/add-to-offer";
import { SupplierSearch } from "./SupplierSearch";

export type OfferRow =
  | { kind: "arbeit"; id: string; description: string; rubric: string | null; sort_order: number; amount: number | null; row: Labour }
  | { kind: "material"; id: string; description: string; rubric: string | null; sort_order: number; amount: number | null; row: Material };

export function offerRows(labour: Labour[], materials: Material[], markup: number): OfferRow[] {
  const rows: OfferRow[] = [
    ...labour.map((l) => ({ kind: "arbeit" as const, id: l.id, description: l.description, rubric: l.rubric, sort_order: l.sort_order, amount: labourQuoteAmount(l), row: l })),
    ...materials.map((m) => {
      const p = linkedProduct(m as unknown as Parameters<typeof linkedProduct>[0]);
      const vk = p ? unitSalesPrice(p, markup) : null;
      return { kind: "material" as const, id: m.id, description: p?.name || m.description, rubric: m.rubric, sort_order: m.sort_order, amount: vk != null ? vk * Number(m.quantity) : null, row: m };
    }),
  ];
  return rows.sort((a, b) => a.sort_order - b.sort_order);
}

export function OfferRubrics({
  jobId, rows, texts, locked, rate, onEditLabour, onEditMaterial, onPickProduct,
}: {
  jobId: string;
  rows: OfferRow[];
  texts: Record<string, string>;
  locked: boolean;
  rate: number;
  onEditLabour: (d: Partial<Labour> & { job_id: string }) => void;
  onEditMaterial: (d: Partial<Material> & { job_id: string }) => void;
  onPickProduct: (m: Material) => void;
}) {
  const qc = useQueryClient();
  const [extra, setExtra] = useState<string[]>([]);
  const [searchFor, setSearchFor] = useState<string | null>(null);
  const groups = groupByRubric(rows, (r) => r.amount ?? 0);
  const used = new Set(rows.map((r) => rubricOf(r)));
  const shown = new Set([...used, ...extra, ...Object.keys(texts).filter((k) => texts[k]?.trim())]);
  const allRubrics = RUBRICS.filter((r) => shown.has(r.code));
  const missing = RUBRICS.filter((r) => !shown.has(r.code));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["labour", jobId] });
    qc.invalidateQueries({ queryKey: ["materials", jobId] });
  };
  const table = (r: OfferRow) => (r.kind === "arbeit" ? "labour_items" : "material_requirements");

  async function setText(code: string, value: string) {
    const next = { ...texts, [code]: value };
    const { error } = await supabase.from("jobs").update({ offer_rubric_texts: next }).eq("id", jobId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["job", jobId] });
  }

  async function moveTo(r: OfferRow, code: string) {
    const { error } = await supabase.from(table(r) as "labour_items").update({ rubric: code }).eq("id", r.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function shift(list: OfferRow[], i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const a = list[i]!, b = list[j]!;
    // Give every row of the rubric a distinct order, then swap the two.
    const orders = list.map((x) => x.sort_order).sort((x, y) => x - y).map((v, k, arr) => (k > 0 && v <= arr[k - 1]! ? arr[k - 1]! + 1 : v));
    const next = list.map((x, k) => ({ x, o: orders[k]! }));
    next[i]!.o = orders[j]!; next[j]!.o = orders[i]!;
    await Promise.all(next.map(({ x, o }) => (x.sort_order !== o || x === a || x === b
      ? supabase.from(table(x) as "labour_items").update({ sort_order: o }).eq("id", x.id) : null)));
    refresh();
  }

  async function setQty(r: OfferRow, v: number) {
    const { error } = r.kind === "arbeit"
      ? await supabase.from("labour_items").update({ hours: v }).eq("id", r.id)
      : await supabase.from("material_requirements").update({ quantity: v }).eq("id", r.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function remove(r: OfferRow) {
    if (!confirm(`«${r.description || "Position"}» löschen?`)) return;
    const { error } = await supabase.from(table(r) as "labour_items").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  return (
    <div className="space-y-4">
      {groups.length === 0 && allRubrics.length === 0 && <p className="surface px-4 py-4 text-sm text-muted-foreground">Noch keine Positionen. Rubrik unten hinzufügen.</p>}
      {allRubrics.map((rub) => {
        const list = groups.flatMap((g) => g.rubrics).find((g) => g.rubric.code === rub.code)?.items ?? [];
        const total = list.reduce((s, r) => s + (r.amount ?? 0), 0);
        return (
          <section key={rub.code} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h2 className="section-title"><span className="tabular text-muted-foreground">{rub.code}</span> {rub.title}</h2>
              <span className="shrink-0 text-sm font-semibold tabular">{formatCHF(total)}</span>
            </div>
            <div className="list-group">
              <RubricText code={rub.code} title={rub.title} positions={list.map(positionLine)} value={texts[rub.code] ?? ""} template={rub.template} locked={locked} onSave={(v) => setText(rub.code, v)} />
              {list.length > 0 && (
                <div className="hidden grid-cols-[1fr_88px_110px_110px_76px] gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                  <span>Bezeichnung</span><span className="text-right">Menge</span><span className="text-right">Einzelpreis</span><span className="text-right">Total</span><span />
                </div>
              )}
              {list.map((r, i) => {
                const qty = r.kind === "arbeit" ? Number(r.row.hours) : Number(r.row.quantity);
                const unit = r.kind === "arbeit" ? "h" : r.row.unit;
                const each = r.kind === "arbeit" ? Number(r.row.hourly_rate) : (r.amount != null && qty > 0 ? r.amount / qty : null);
                return (
                  <div key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 px-3 py-2 sm:grid-cols-[1fr_88px_110px_110px_76px]">
                    <button type="button" disabled={locked} onClick={() => (r.kind === "arbeit" ? onEditLabour(r.row) : onEditMaterial(r.row))} className="col-span-2 min-w-0 text-left sm:col-span-1">
                      <div className="truncate text-[14px]">{r.description || "–"}</div>
                      <div className="text-[11px] text-muted-foreground">{r.kind === "arbeit" ? "Arbeit" : "Material"}</div>
                    </button>
                    <QtyInput value={qty} unit={unit} locked={locked} onSave={(v) => void setQty(r, v)} />
                    <span className="hidden text-right text-sm text-muted-foreground tabular sm:block">{each != null ? formatCHF(each) : "–"}</span>
                    {r.kind === "material" && r.amount == null ? (
                      <button type="button" disabled={locked} onClick={() => onPickProduct(r.row)} className="flex h-8 items-center justify-center gap-1 justify-self-end rounded-full border border-warning/60 bg-warning/10 px-3 text-xs font-medium"><Tag className="h-3.5 w-3.5" /> Produkt</button>
                    ) : (
                      <span className="text-right text-[14px] font-semibold tabular">{formatCHF(r.amount ?? 0)}</span>
                    )}
                    {!locked ? (
                      <div className="col-span-2 flex items-center justify-end gap-0.5 sm:col-span-1">
                        <RowMenu
                          canUp={i > 0} canDown={i < list.length - 1} rubric={rubricOf(r)}
                          onUp={() => void shift(list, i, -1)} onDown={() => void shift(list, i, 1)}
                          onMove={(c) => void moveTo(r, c)} onDelete={() => void remove(r)}
                        />
                      </div>
                    ) : <span className="hidden sm:block" />}
                  </div>
                );
              })}
              {!locked && (
                <div className="grid grid-cols-2 divide-x divide-border">
                  <button type="button" onClick={() => onEditLabour({ job_id: jobId, hours: 1, hourly_rate: rate, rubric: rub.code })} className="flex h-11 items-center justify-center gap-1 text-sm font-medium text-primary active:bg-muted"><Plus className="h-4 w-4" /> Arbeit</button>
                  <button type="button" onClick={() => setSearchFor(rub.code)} className="flex h-11 items-center justify-center gap-1 text-sm font-semibold text-primary active:bg-muted"><Plus className="h-4 w-4" /> Material</button>
                </div>
              )}
            </div>
          </section>
        );
      })}
      <SupplierSearch
        open={searchFor != null}
        title={searchFor ? `Produkt für ${searchFor} ${RUBRICS.find((x) => x.code === searchFor)?.title ?? ""}` : undefined}
        onClose={() => setSearchFor(null)}
        footer={searchFor ? (
          <button type="button" onClick={() => { const code = searchFor; setSearchFor(null); onEditMaterial({ job_id: jobId, quantity: 1, unit: "Stk", status: "Offen", rubric: code }); }} className="h-11 w-full rounded-xl border border-dashed border-border text-sm font-medium text-primary">Manuell erfassen (ohne Katalog)</button>
        ) : undefined}
        onPick={async (hit) => {
          if (!searchFor) return;
          try {
            const max = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);
            await addCatalogHitToOffer(jobId, searchFor, hit, max + 1);
            toast.success("In Offerte übernommen – Menge antippen zum Anpassen");
            refresh();
            setSearchFor(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Übernehmen fehlgeschlagen");
          }
        }}
      />
      {!locked && missing.length > 0 && (
        <select value="" onChange={(e) => e.target.value && setExtra([...extra, e.target.value])} className="h-12 w-full rounded-xl border border-dashed border-border bg-card px-3 text-sm font-medium text-primary">
          <option value="">+ Rubrik hinzufügen…</option>
          {missing.map((r) => <option key={r.code} value={r.code}>{r.code} {r.title}</option>)}
        </select>
      )}
    </div>
  );
}

function positionLine(r: OfferRow) {
  return r.kind === "arbeit"
    ? `Arbeit: ${r.description}`
    : `Material: ${Number(r.row.quantity).toLocaleString("de-CH")} ${r.row.unit} ${r.description}`;
}

function QtyInput({ value, unit, locked, onSave }: { value: number; unit: string; locked: boolean; onSave: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return setDraft(String(value));
    if (n !== value) onSave(n);
  };
  return (
    <div className="flex items-center justify-end gap-1">
      <input
        aria-label="Menge" inputMode="decimal" disabled={locked} value={draft}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="h-8 w-14 rounded-md border border-border bg-card px-1.5 text-right text-sm tabular disabled:border-transparent"
      />
      <span className="w-6 text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

function RowMenu({ canUp, canDown, rubric, onUp, onDown, onMove, onDelete }: {
  canUp: boolean; canDown: boolean; rubric: string;
  onUp: () => void; onDown: () => void; onMove: (code: string) => void; onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Aktionen" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><MoreHorizontal className="h-4 w-4" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
        <DropdownMenuItem disabled={!canUp} onClick={onUp}><ArrowUp className="mr-2 h-4 w-4" /> Nach oben</DropdownMenuItem>
        <DropdownMenuItem disabled={!canDown} onClick={onDown}><ArrowDown className="mr-2 h-4 w-4" /> Nach unten</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Verschieben nach</DropdownMenuLabel>
        {RUBRICS.filter((x) => x.code !== rubric).map((x) => (
          <DropdownMenuItem key={x.code} onClick={() => onMove(x.code)} className="text-xs"><span className="mr-2 tabular text-muted-foreground">{x.code}</span>{x.title}</DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Löschen</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RubricText({ code, title, positions, value, template, locked, onSave }: { code: string; title: string; positions: string[]; value: string; template: string; locked: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const generate = useServerFn(generateRubricText);
  async function runAi() {
    if (positions.length === 0) return toast.error("Zuerst Positionen erfassen");
    setBusy(true);
    try {
      const { text } = await generate({ data: { rubric: `${code} ${title}`, positions } });
      setDraft(text);
      setEditing(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "KI-Text fehlgeschlagen");
    } finally { setBusy(false); }
  }
  const aiBtn = !locked && (
    <button type="button" onClick={() => void runAi()} disabled={busy} className="flex h-9 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 text-xs font-semibold text-primary disabled:opacity-60">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {busy ? "Schreibt…" : value || editing ? "Neu mit KI" : "KI-Beschrieb"}
    </button>
  );
  if (editing) {
    return (
      <div className="space-y-2 border-b border-border bg-muted/20 px-3 py-3">
        <Textarea autoFocus rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} className="text-sm" placeholder={`Leistungsbeschrieb ${code}`} />
        <div className="flex flex-wrap gap-2">
          {aiBtn}
          <button onClick={() => setDraft(template)} className="h-9 rounded-lg border border-border px-3 text-xs">Vorlage</button>
          <div className="flex-1" />
          <button onClick={() => { setDraft(value); setEditing(false); }} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border"><X className="h-4 w-4" /></button>
          <button onClick={() => { onSave(draft.trim()); setEditing(false); }} className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Speichern</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 border-b border-border bg-muted/20 px-3 py-3">
      <button type="button" disabled={locked} onClick={() => { setDraft(value || template); setEditing(true); }} className="flex min-w-0 flex-1 gap-2 text-left">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        {value
          ? <span className="line-clamp-4 whitespace-pre-line text-sm">{value}</span>
          : <span className="text-sm text-muted-foreground">{locked ? "Kein Leistungsbeschrieb" : "Leistungsbeschrieb für den Kunden – antippen oder mit KI erstellen"}</span>}
      </button>
      {aiBtn}
    </div>
  );
}

export function ExclusionsSection({ jobId, list, locked }: { jobId: string; list: string[]; locked: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState("");
  async function save(next: string[]) {
    const { error } = await supabase.from("jobs").update({ offer_exclusions: next }).eq("id", jobId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["job", jobId] });
  }
  return (
    <section className="space-y-2">
      <h2 className="section-title px-1">Nicht enthalten / Annahmen</h2>
      <div className="list-group">
        {!list.length && <p className="px-4 py-3 text-sm text-muted-foreground">Keine Punkte.</p>}
        {list.map((t, i) => (
          <div key={i} className="flex items-start gap-2 px-4 py-2.5">
            <span className="mt-0.5 text-muted-foreground">–</span>
            <span className="flex-1 text-sm">{t}</span>
            {!locked && <button aria-label="Entfernen" onClick={() => void save(list.filter((_, k) => k !== i))} className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground"><X className="h-4 w-4" /></button>}
          </div>
        ))}
        {!locked && (
          <form onSubmit={(e) => { e.preventDefault(); if (adding.trim()) { void save([...list, adding.trim()]); setAdding(""); } }} className="flex gap-2 px-3 py-2">
            <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Punkt ergänzen…" className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm" />
            <button disabled={!adding.trim()} className="h-10 rounded-lg border border-border px-3 text-sm font-medium text-primary disabled:opacity-40"><Plus className="h-4 w-4" /></button>
          </form>
        )}
      </div>
    </section>
  );
}
