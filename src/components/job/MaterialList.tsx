import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/CustomerForm";
import { StatusBadge } from "@/components/Brand";
import { categoriesQuery } from "@/lib/queries";
import { MATERIAL_STATUSES, UNITS, type Material } from "@/lib/app";

type Draft = Partial<Material> & { job_id: string };

export function useMaterials(jobId: string) {
  return useQuery({
    queryKey: ["materials", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("material_requirements").select("*").eq("job_id", jobId).order("sort_order").order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function MaterialEditor({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const qc = useQueryClient();
  const cats = useQuery(categoriesQuery());
  const [d, setD] = useState<Draft | null>(draft);
  if (draft && d?.id !== draft.id && d?.job_id !== draft.job_id) setD(draft);
  const cur = d ?? draft;

  async function save() {
    if (!cur) return;
    const { id, created_at, updated_at, user_id, ...rest } = cur;
    void created_at; void updated_at; void user_id;
    const payload = { ...rest, description: rest.description ?? "", job_id: cur.job_id };
    const { error } = id
      ? await supabase.from("material_requirements").update(payload).eq("id", id)
      : await supabase.from("material_requirements").insert({ ...payload, sort_order: Date.now() % 1_000_000_000 });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["materials", cur.job_id] });
    onClose();
  }

  const set = (k: keyof Material, v: unknown) => cur && setD({ ...cur, [k]: v });

  return (
    <Sheet open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader><SheetTitle>{cur?.id ? "Material bearbeiten" : "Material hinzufügen"}</SheetTitle></SheetHeader>
        {cur && (
          <div className="space-y-3 p-4 pt-0">
            <Field label="Kategorie">
              <select value={cur.category_id ?? ""} onChange={(e) => set("category_id", e.target.value || null)} className="h-12 w-full rounded-md border border-input bg-card px-3 text-base">
                <option value="">– wählen –</option>
                {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Beschreibung"><Input autoFocus className="h-12 text-base" value={cur.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Menge"><Input className="h-12 text-base" inputMode="decimal" type="number" step="any" value={cur.quantity ?? 1} onChange={(e) => set("quantity", Number(e.target.value))} /></Field>
              <Field label="Einheit">
                <select value={cur.unit ?? "Stk"} onChange={(e) => set("unit", e.target.value)} className="h-12 w-full rounded-md border border-input bg-card px-3 text-base">
                  {UNITS.map((u) => <option key={u}>{u}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Bevorzugte Marke"><Input className="h-12 text-base" value={cur.preferred_brand ?? ""} onChange={(e) => set("preferred_brand", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Masse"><Input className="h-12 text-base" value={cur.dimensions ?? ""} onChange={(e) => set("dimensions", e.target.value)} /></Field>
              <Field label="Farbe / Oberfläche"><Input className="h-12 text-base" value={cur.finish ?? ""} onChange={(e) => set("finish", e.target.value)} /></Field>
            </div>
            <Field label="Status">
              <div className="grid grid-cols-2 gap-2">
                {MATERIAL_STATUSES.map((s) => (
                  <button key={s} onClick={() => set("status", s)} className={`h-11 rounded-lg border text-sm font-medium ${cur.status === s ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{s}</button>
                ))}
              </div>
            </Field>
            <Field label="Notizen"><Textarea className="min-h-20 text-base" value={cur.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
            <Button className="h-12 w-full font-semibold" onClick={save}>Speichern</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function MaterialList({ jobId, onEdit }: { jobId: string; onEdit: (m: Draft) => void }) {
  const qc = useQueryClient();
  const { data } = useMaterials(jobId);
  const cats = useQuery(categoriesQuery());
  const catName = (id: string | null) => cats.data?.find((c) => c.id === id)?.name ?? "Ohne Kategorie";
  const list = data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["materials", jobId] });

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const a = list[i], b = list[j];
    await Promise.all([
      supabase.from("material_requirements").update({ sort_order: j }).eq("id", a.id),
      supabase.from("material_requirements").update({ sort_order: i }).eq("id", b.id),
      ...list.map((m, k) => (k !== i && k !== j && m.sort_order !== k ? supabase.from("material_requirements").update({ sort_order: k }).eq("id", m.id) : null)),
    ]);
    refresh();
  }
  async function duplicate(m: Material) {
    const { id, created_at, updated_at, user_id, ...rest } = m;
    void id; void created_at; void updated_at; void user_id;
    await supabase.from("material_requirements").insert({ ...rest, sort_order: m.sort_order + 1 });
    refresh();
  }
  async function remove(m: Material) {
    if (!confirm("Position löschen?")) return;
    await supabase.from("material_requirements").delete().eq("id", m.id);
    refresh();
  }

  if (!list.length) return <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Noch kein Material erfasst.</p>;

  return (
    <div className="space-y-2">
      {list.map((m, i) => (
        <div key={m.id} className="rounded-xl border bg-card p-3">
          <button onClick={() => onEdit(m)} className="block w-full text-left">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">{catName(m.category_id)}</span>
              <StatusBadge status={m.status} />
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">{m.description || "–"}</span>
              <span className="shrink-0 font-mono text-sm">{Number(m.quantity)} {m.unit}</span>
            </div>
            {(m.preferred_brand || m.dimensions || m.finish) && (
              <div className="mt-1 text-sm text-muted-foreground">{[m.preferred_brand, m.dimensions, m.finish].filter(Boolean).join(" · ")}</div>
            )}
            {m.notes && <div className="mt-1 text-sm text-muted-foreground">{m.notes}</div>}
          </button>
          <div className="mt-2 flex justify-end gap-1 border-t pt-2">
            <IconBtn label="Nach oben" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></IconBtn>
            <IconBtn label="Nach unten" onClick={() => move(i, 1)} disabled={i === list.length - 1}><ArrowDown className="h-4 w-4" /></IconBtn>
            <IconBtn label="Duplizieren" onClick={() => duplicate(m)}><Copy className="h-4 w-4" /></IconBtn>
            <IconBtn label="Bearbeiten" onClick={() => onEdit(m)}><Pencil className="h-4 w-4" /></IconBtn>
            <IconBtn label="Löschen" onClick={() => remove(m)} danger><Trash2 className="h-4 w-4" /></IconBtn>
          </div>
        </div>
      ))}
    </div>
  );
}

export function IconBtn({ children, label, onClick, disabled, danger }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button aria-label={label} onClick={onClick} disabled={disabled}
      className={`flex h-10 w-10 items-center justify-center rounded-lg border disabled:opacity-30 ${danger ? "text-destructive" : "text-muted-foreground"}`}>
      {children}
    </button>
  );
}
