import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  GripVertical,
  Heading,
  Loader2,
  MoreHorizontal,
  Percent,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { generateRubricText } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { formatCHF, type Labour, type Material } from "@/lib/app";
import { discountPercent } from "@/lib/discount";
import { moveOfferRow, type OfferRow, type OfferTextRow, type OfferTextStyle } from "@/lib/offer-editor";
import { RUBRICS, groupByRubric, rubricOf } from "@/lib/rubrics";
import { addCatalogHitToOffer } from "@/lib/suppliers/add-to-offer";
import { SupplierSearch } from "./SupplierSearch";

export { offerRows } from "@/lib/offer-editor";
export type { OfferRow } from "@/lib/offer-editor";

type EditableRow = Extract<OfferRow, { kind: "arbeit" | "material" }>;
type FreeRow = Extract<OfferRow, { kind: "text" | "heading" }>;

const isPricedRow = (r: OfferRow): r is EditableRow => r.kind === "arbeit" || r.kind === "material";
const isFreeRow = (r: OfferRow): r is FreeRow => r.kind === "text" || r.kind === "heading";
const table = (r: EditableRow) => r.kind === "arbeit" ? "labour_items" : "material_requirements";

function serializedTextRows(rows: OfferRow[]): OfferTextRow[] {
  return rows.filter(isFreeRow).map((r) => ({
    id: r.id,
    rubric: r.rubric,
    text: r.description,
    style: r.kind,
    sort_order: r.sort_order,
  }));
}

export function OfferRubrics({
  jobId,
  rows,
  texts,
  locked,
  rate,
  onEditLabour,
  onEditMaterial,
  onPickProduct,
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
  const [composer, setComposer] = useState<{ code: string; style: OfferTextStyle } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const groups = groupByRubric(rows, (r) => r.amount ?? 0);
  const used = new Set(rows.map((r) => rubricOf(r)));
  const shown = new Set([...used, ...extra, ...Object.keys(texts).filter((k) => texts[k]?.trim())]);
  const allRubrics = RUBRICS.filter((r) => shown.has(r.code));
  const missing = RUBRICS.filter((r) => !shown.has(r.code));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["labour", jobId] });
    qc.invalidateQueries({ queryKey: ["materials", jobId] });
    qc.invalidateQueries({ queryKey: ["job", jobId] });
  };

  async function saveTextRows(next: OfferRow[]) {
    const { error } = await supabase.from("jobs").update({ offer_text_rows: serializedTextRows(next) }).eq("id", jobId);
    if (error) {
      toast.error(error.message);
      return false;
    }
    qc.invalidateQueries({ queryKey: ["job", jobId] });
    return true;
  }

  async function persistOrder(next: OfferRow[]) {
    const previous = new Map(rows.map((r) => [r.id, r]));
    const changed = next.filter(isPricedRow).filter((r) => {
      const old = previous.get(r.id);
      return old?.rubric !== r.rubric || old.sort_order !== r.sort_order;
    });
    const operations = changed.map((r) =>
      supabase.from(table(r) as "labour_items").update({ rubric: r.rubric, sort_order: r.sort_order }).eq("id", r.id),
    );
    if (JSON.stringify(serializedTextRows(rows)) !== JSON.stringify(serializedTextRows(next))) {
      operations.push(supabase.from("jobs").update({ offer_text_rows: serializedTextRows(next) }).eq("id", jobId) as never);
    }
    const results = await Promise.all(operations);
    const error = results.find((result) => result?.error)?.error;
    if (error) return toast.error(error.message);
    refresh();
  }

  async function dropRow(event: DragEndEvent) {
    if (!event.over) return;
    const next = moveOfferRow(rows, String(event.active.id), String(event.over.id));
    if (next !== rows) await persistOrder(next);
  }

  async function moveTo(r: OfferRow, code: string) {
    await persistOrder(moveOfferRow(rows, r.id, `rubric:${code}`));
  }

  async function shift(list: OfferRow[], i: number, dir: -1 | 1) {
    const target = list[i + dir];
    if (!target) return;
    await persistOrder(moveOfferRow(rows, list[i]!.id, target.id));
  }

  async function setQty(r: EditableRow, v: number) {
    const { error } = r.kind === "arbeit"
      ? await supabase.from("labour_items").update({ hours: v }).eq("id", r.id)
      : await supabase.from("material_requirements").update({ quantity: v }).eq("id", r.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function setDiscount(r: EditableRow, value: number) {
    const { error } = await supabase.from(table(r) as "labour_items").update({ discount: value }).eq("id", r.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function applyBulkDiscount(value: number) {
    const priced = rows.filter(isPricedRow);
    if (!priced.length) {
      toast.error("Zuerst Positionen erfassen");
      return;
    }
    const results = await Promise.all(
      priced.map((r) => supabase.from(table(r) as "labour_items").update({ discount: value }).eq("id", r.id)),
    );
    const error = results.find((r) => r.error)?.error;
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(value > 0 ? `${value} % Rabatt auf alle Positionen angewendet` : "Rabatte entfernt");
    refresh();
  }

  async function saveFreeText(existing: FreeRow | null, code: string, style: OfferTextStyle, text: string) {
    const openingComposer = composer;
    const clean = text.trim();
    if (!clean) return toast.error("Text eingeben");
    let next: OfferRow[];
    if (existing) {
      next = rows.map((r) => r.id === existing.id ? { ...r, description: clean, row: { ...r.row, text: clean } } as OfferRow : r);
    } else {
      const sort_order = Math.max(-1, ...rows.filter((r) => r.rubric === code).map((r) => r.sort_order)) + 1;
      const row: OfferTextRow = { id: crypto.randomUUID(), rubric: code, text: clean, style, sort_order };
      next = [...rows, { kind: style, id: row.id, description: clean, rubric: code, sort_order, amount: null, row }];
    }
    if (await saveTextRows(next)) setComposer((current) => current === openingComposer ? null : current);
  }

  async function remove(r: OfferRow) {
    if (!confirm(`«${r.description || "Position"}» löschen?`)) return;
    if (isFreeRow(r)) {
      await saveTextRows(rows.filter((x) => x.id !== r.id));
      return;
    }
    const { error } = await supabase.from(table(r) as "labour_items").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  return (
    <div className="space-y-4">
      {!locked && rows.some(isPricedRow) && <BulkDiscount onApply={applyBulkDiscount} />}
      {groups.length === 0 && allRubrics.length === 0 && <p className="surface px-4 py-4 text-sm text-muted-foreground">Noch keine Positionen. Rubrik unten hinzufügen.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void dropRow(event)}>
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
                <RubricText
                  code={rub.code}
                  title={rub.title}
                  positions={list.filter(isPricedRow).map(positionLine)}
                  value={texts[rub.code] ?? ""}
                  template={rub.template}
                  locked={locked}
                  onSave={async (v) => {
                    const next = { ...texts, [rub.code]: v };
                    const { error } = await supabase.from("jobs").update({ offer_rubric_texts: next }).eq("id", jobId);
                    if (error) toast.error(error.message);
                    else qc.invalidateQueries({ queryKey: ["job", jobId] });
                  }}
                />
                {list.some(isPricedRow) && (
                  <div className="ml-8 hidden grid-cols-[minmax(0,1fr)_80px_100px_64px_100px_36px] gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
                    <span>Bezeichnung</span><span className="text-right">Menge</span><span className="text-right">Einzelpreis</span><span className="text-right">Rabatt</span><span className="text-right">Total</span><span />
                  </div>
                )}
                <SortableContext id={`items:${rub.code}`} items={list.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                  <RubricDropZone code={rub.code}>
                    {list.map((r, i) => (
                      <SortableOfferRow
                        key={r.id}
                        row={r}
                        locked={locked}
                        canUp={i > 0}
                        canDown={i < list.length - 1}
                        onUp={() => void shift(list, i, -1)}
                        onDown={() => void shift(list, i, 1)}
                        onMove={(code) => void moveTo(r, code)}
                        onDelete={() => void remove(r)}
                        onEdit={() => isPricedRow(r) && (r.kind === "arbeit" ? onEditLabour(r.row) : onEditMaterial(r.row))}
                        onSaveQty={(v) => { if (isPricedRow(r)) void setQty(r, v); }}
                        onSaveDiscount={(v) => { if (isPricedRow(r)) void setDiscount(r, v); }}
                        onSaveText={(text) => isFreeRow(r) && void saveFreeText(r, r.rubric, r.kind, text)}
                        onPickProduct={() => isPricedRow(r) && r.kind === "material" && onPickProduct(r.row)}
                      />
                    ))}
                  </RubricDropZone>
                </SortableContext>
                {composer?.code === rub.code && (
                  <FreeTextForm
                    style={composer.style}
                    onCancel={() => setComposer(null)}
                    onSave={(text) => void saveFreeText(null, rub.code, composer.style, text)}
                  />
                )}
                {!locked && (
                  <div className="grid grid-cols-2 border-t border-border md:grid-cols-4">
                    <AddButton icon={<Plus className="h-4 w-4" />} label="Arbeit" onClick={() => onEditLabour({ job_id: jobId, hours: 1, hourly_rate: rate, rubric: rub.code })} />
                    <AddButton icon={<Plus className="h-4 w-4" />} label="Material" onClick={() => setSearchFor(rub.code)} />
                    <AddButton icon={<Type className="h-4 w-4" />} label="Freitext" onClick={() => setComposer({ code: rub.code, style: "text" })} />
                    <AddButton icon={<Heading className="h-4 w-4" />} label="Zwischentitel" onClick={() => setComposer({ code: rub.code, style: "heading" })} />
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </DndContext>
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

function AddButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex h-11 items-center justify-center gap-1 border-b border-r border-border text-xs font-medium text-primary active:bg-muted md:border-b-0">{icon}{label}</button>;
}

function RubricDropZone({ code, children }: { code: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `rubric:${code}` });
  return <div ref={setNodeRef} className={`min-h-1 transition-colors ${isOver ? "bg-accent/60" : ""}`}>{children}</div>;
}

function SortableOfferRow({
  row: r,
  locked,
  canUp,
  canDown,
  onUp,
  onDown,
  onMove,
  onDelete,
  onEdit,
  onSaveQty,
  onSaveDiscount,
  onSaveText,
  onPickProduct,
}: {
  row: OfferRow;
  locked: boolean;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onMove: (code: string) => void;
  onDelete: () => void;
  onEdit: () => void;
  onSaveQty: (value: number) => void;
  onSaveDiscount: (value: number) => void;
  onSaveText: (text: string) => void;
  onPickProduct: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r.id, disabled: locked });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const free = isFreeRow(r);
  return (
    <div ref={setNodeRef} style={style} className={`flex items-stretch border-b border-border bg-card last:border-b-0 ${isDragging ? "relative z-20 opacity-70 shadow-lg" : ""}`}>
      {!locked ? (
        <button type="button" aria-label="Position mit Ziehen verschieben" title="Ziehen zum Verschieben" className="flex w-8 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
      ) : <span className="w-2 shrink-0" />}
      {free ? (
        <FreeTextDisplay row={r} locked={locked} onSave={onSaveText} onDelete={onDelete} onUp={onUp} onDown={onDown} canUp={canUp} canDown={canDown} onMove={onMove} />
      ) : (
        <PricedRowContent
          row={r}
          locked={locked}
          canUp={canUp}
          canDown={canDown}
          onUp={onUp}
          onDown={onDown}
          onMove={onMove}
          onDelete={onDelete}
          onEdit={onEdit}
          onSaveQty={onSaveQty}
          onSaveDiscount={onSaveDiscount}
          onPickProduct={onPickProduct}
        />
      )}
    </div>
  );
}

function PricedRowContent({ row: r, locked, canUp, canDown, onUp, onDown, onMove, onDelete, onEdit, onSaveQty, onSaveDiscount, onPickProduct }: {
  row: EditableRow;
  locked: boolean;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onMove: (code: string) => void;
  onDelete: () => void;
  onEdit: () => void;
  onSaveQty: (value: number) => void;
  onSaveDiscount: (value: number) => void;
  onPickProduct: () => void;
}) {
  const qty = r.kind === "arbeit" ? Number(r.row.hours) : Number(r.row.quantity);
  const unit = r.kind === "arbeit" ? "h" : r.row.unit;
  const grossAmount = r.kind === "arbeit" ? Number(r.row.hours) * Number(r.row.hourly_rate) : null;
  const each = r.kind === "arbeit" ? Number(r.row.hourly_rate) : (r.amount != null && qty > 0 ? discountedUnit(r.amount, qty, r.row.discount) : null);
  return (
    <div className="relative grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-2 px-2 py-2 md:grid-cols-[minmax(0,1fr)_80px_100px_64px_100px_36px] md:px-3">
      <button type="button" disabled={locked} onClick={onEdit} className="col-span-3 min-w-0 pr-6 text-left md:col-span-1 md:pr-0">
        <div className="truncate text-[14px]">{r.description || "–"}</div>
        <div className="text-[11px] text-muted-foreground">{r.kind === "arbeit" ? "Arbeit" : "Material"}{grossAmount != null && r.amount != null && grossAmount !== r.amount ? ` · vor Rabatt ${formatCHF(grossAmount)}` : ""}</div>
      </button>
      <QtyInput value={qty} unit={unit} locked={locked} onSave={onSaveQty} />
      <span className="hidden text-right text-sm text-muted-foreground tabular md:block">{each != null ? formatCHF(each) : "–"}</span>
      <DiscountInput value={discountPercent(r.row.discount)} locked={locked} onSave={onSaveDiscount} />
      {r.kind === "material" && r.amount == null ? (
        <button type="button" disabled={locked} onClick={onPickProduct} className="flex h-8 items-center justify-center gap-1 justify-self-end rounded-full border border-warning/60 bg-warning/10 px-3 text-xs font-medium"><Tag className="h-3.5 w-3.5" /> Produkt</button>
      ) : (
        <span className="text-right text-[14px] font-semibold tabular">{formatCHF(r.amount ?? 0)}</span>
      )}
      {!locked ? (
        <div className="absolute right-0 top-0 flex items-center justify-end md:static md:col-span-1">
          <RowMenu canUp={canUp} canDown={canDown} rubric={r.rubric} onUp={onUp} onDown={onDown} onMove={onMove} onDelete={onDelete} />
        </div>
      ) : <span className="hidden md:block" />}
    </div>
  );
}

function discountedUnit(discountedTotal: number, qty: number, discount: number | null) {
  return discountedTotal / qty / (1 - discountPercent(discount) / 100 || 1);
}

function positionLine(r: EditableRow) {
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
      <input aria-label="Menge" inputMode="decimal" disabled={locked} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className="h-8 w-14 rounded-md border border-border bg-card px-1.5 text-right text-sm tabular disabled:border-transparent" />
      <span className="w-6 text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

function DiscountInput({ value, locked, onSave }: { value: number; locked: boolean; onSave: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setDraft(String(value));
      return toast.error("Rabatt zwischen 0 und 100 % eingeben");
    }
    if (n !== value) onSave(n);
  };
  return (
    <div className="flex items-center justify-end gap-0.5" title="Rabatt auf diese Position">
      <input aria-label="Rabatt in Prozent" inputMode="decimal" disabled={locked} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className="h-8 w-11 rounded-md border border-border bg-card px-1 text-right text-sm tabular disabled:border-transparent" />
      <span className="text-xs text-muted-foreground">%</span>
    </div>
  );
}

function BulkDiscount({ onApply }: { onApply: (value: number) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("0");
  const [busy, setBusy] = useState(false);
  async function apply() {
    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) return toast.error("Rabatt zwischen 0 und 100 % eingeben");
    setBusy(true);
    try {
      await onApply(n);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium text-primary"><Percent className="h-4 w-4" /> Rabatt auf alle Positionen</button>;
  return (
    <div className="surface flex items-end gap-2 p-3">
      <label className="min-w-0 flex-1 text-xs font-medium">Rabatt für alle Arbeiten und Produkte<div className="mt-1 flex items-center gap-2"><input autoFocus aria-label="Bulk-Rabatt in Prozent" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-right text-sm tabular" /><span className="text-sm">%</span></div></label>
      <button type="button" disabled={busy} onClick={() => void apply()} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "…" : "Anwenden"}</button>
      <button type="button" aria-label="Bulk-Rabatt schliessen" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border"><X className="h-4 w-4" /></button>
    </div>
  );
}

function FreeTextDisplay({ row, locked, onSave, onDelete, onUp, onDown, canUp, canDown, onMove }: {
  row: FreeRow;
  locked: boolean;
  onSave: (text: string) => void;
  onDelete: () => void;
  onUp: () => void;
  onDown: () => void;
  canUp: boolean;
  canDown: boolean;
  onMove: (code: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) return <div className="min-w-0 flex-1"><FreeTextForm style={row.kind} initial={row.description} onCancel={() => setEditing(false)} onSave={(text) => { onSave(text); setEditing(false); }} /></div>;
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2.5">
      <button type="button" disabled={locked} onClick={() => setEditing(true)} className={`min-w-0 flex-1 whitespace-pre-line text-left ${row.kind === "heading" ? "text-sm font-semibold text-primary" : "text-sm text-muted-foreground"}`}>{row.description}</button>
      {!locked && <RowMenu canUp={canUp} canDown={canDown} rubric={row.rubric} onUp={onUp} onDown={onDown} onMove={onMove} onDelete={onDelete} />}
    </div>
  );
}

function FreeTextForm({ style, initial = "", onSave, onCancel }: { style: OfferTextStyle; initial?: string; onSave: (text: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) onSave(draft); }} className="flex min-w-0 flex-1 items-start gap-2 bg-muted/20 p-3">
      <Textarea autoFocus rows={style === "heading" ? 1 : 3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={style === "heading" ? "Zwischentitel…" : "Freitext für den Kunden…"} className="min-w-0 flex-1 text-sm" />
      <button type="submit" disabled={!draft.trim()} className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40">Speichern</button>
      <button type="button" aria-label="Textbearbeitung schliessen" onClick={onCancel} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border"><X className="h-4 w-4" /></button>
    </form>
  );
}

function RowMenu({ canUp, canDown, rubric, onUp, onDown, onMove, onDelete }: {
  canUp: boolean;
  canDown: boolean;
  rubric: string;
  onUp: () => void;
  onDown: () => void;
  onMove: (code: string) => void;
  onDelete: () => void;
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
    } finally {
      setBusy(false);
    }
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
