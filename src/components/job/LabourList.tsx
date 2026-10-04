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
import { IconBtn } from "./MaterialList";
import { settingsQuery } from "@/lib/queries";
import { formatCHF, type Labour } from "@/lib/app";

type Draft = Partial<Labour> & { job_id: string };

export function useLabour(jobId: string) {
  return useQuery({
    queryKey: ["labour", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("labour_items").select("*").eq("job_id", jobId).order("sort_order").order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function LabourEditor({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft | null>(draft);
  if (draft && d !== draft && (d?.id !== draft.id || !d)) setD(draft);
  const cur = d ?? draft;
  const set = (k: keyof Labour, v: unknown) => cur && setD({ ...cur, [k]: v });

  async function save() {
    if (!cur) return;
    const { id, created_at, updated_at, user_id, ...rest } = cur;
    void created_at; void updated_at; void user_id;
    const payload = { ...rest, description: rest.description ?? "", job_id: cur.job_id };
    const { error } = id
      ? await supabase.from("labour_items").update(payload).eq("id", id)
      : await supabase.from("labour_items").insert({ ...payload, sort_order: Date.now() % 1_000_000_000 });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["labour", cur.job_id] });
    onClose();
  }

  const total = Number(cur?.hours ?? 0) * Number(cur?.hourly_rate ?? 0);

  return (
    <Sheet open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader><SheetTitle>{cur?.id ? "Arbeitsleistung bearbeiten" : "Arbeitsleistung hinzufügen"}</SheetTitle></SheetHeader>
        {cur && (
          <div className="space-y-3 p-4 pt-0">
            <Field label="Beschreibung"><Input autoFocus className="h-12 text-base" value={cur.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="z.B. Demontage bestehende Installation" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stunden (h)"><Input className="h-12 text-base" type="number" inputMode="decimal" step="0.25" value={cur.hours ?? 0} onChange={(e) => set("hours", Number(e.target.value))} /></Field>
              <Field label="Ansatz CHF/h"><Input className="h-12 text-base" type="number" inputMode="decimal" step="any" value={cur.hourly_rate ?? 0} onChange={(e) => set("hourly_rate", Number(e.target.value))} /></Field>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
              <span className="text-sm font-medium text-muted-foreground">Total</span>
              <span className="font-mono text-lg font-medium">{formatCHF(total)}</span>
            </div>
            <Field label="Notizen"><Textarea className="min-h-20 text-base" value={cur.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
            <Button className="h-12 w-full font-semibold" onClick={save}>Speichern</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function LabourList({ jobId, onEdit }: { jobId: string; onEdit: (l: Draft) => void }) {
  const qc = useQueryClient();
  const { data } = useLabour(jobId);
  const settings = useQuery(settingsQuery());
  const list = data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["labour", jobId] });
  const subtotal = list.reduce((s, l) => s + Number(l.hours) * Number(l.hourly_rate), 0);
  const vatRate = Number(settings.data?.vat_rate ?? 8.1);
  const vat = Math.round(subtotal * vatRate) / 100;
  const hours = list.reduce((s, l) => s + Number(l.hours), 0);

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    await Promise.all(
      list.map((m, k) => {
        const target = k === i ? j : k === j ? i : k;
        return m.sort_order !== target ? supabase.from("labour_items").update({ sort_order: target }).eq("id", m.id) : null;
      }),
    );
    refresh();
  }
  async function duplicate(l: Labour) {
    const { id, created_at, updated_at, user_id, ...rest } = l;
    void id; void created_at; void updated_at; void user_id;
    await supabase.from("labour_items").insert({ ...rest, sort_order: l.sort_order + 1 });
    refresh();
  }
  async function remove(l: Labour) {
    if (!confirm("Position löschen?")) return;
    await supabase.from("labour_items").delete().eq("id", l.id);
    refresh();
  }

  return (
    <div className="space-y-2">
      {!list.length && <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Noch keine Arbeitsleistungen erfasst.</p>}
      {list.map((l, i) => (
        <div key={l.id} className="rounded-xl border bg-card p-3">
          <button onClick={() => onEdit(l)} className="block w-full text-left">
            <div className="font-semibold">{l.description || "–"}</div>
            <div className="mt-1 flex items-baseline justify-between font-mono text-sm">
              <span className="text-muted-foreground">{Number(l.hours).toFixed(2)} h × {formatCHF(Number(l.hourly_rate))}</span>
              <span className="font-medium">{formatCHF(Number(l.hours) * Number(l.hourly_rate))}</span>
            </div>
            {l.notes && <div className="mt-1 text-sm text-muted-foreground">{l.notes}</div>}
          </button>
          <div className="mt-2 flex justify-end gap-1 border-t pt-2">
            <IconBtn label="Nach oben" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></IconBtn>
            <IconBtn label="Nach unten" onClick={() => move(i, 1)} disabled={i === list.length - 1}><ArrowDown className="h-4 w-4" /></IconBtn>
            <IconBtn label="Duplizieren" onClick={() => duplicate(l)}><Copy className="h-4 w-4" /></IconBtn>
            <IconBtn label="Bearbeiten" onClick={() => onEdit(l)}><Pencil className="h-4 w-4" /></IconBtn>
            <IconBtn label="Löschen" onClick={() => remove(l)} danger><Trash2 className="h-4 w-4" /></IconBtn>
          </div>
        </div>
      ))}
      {list.length > 0 && (
        <div className="space-y-1 rounded-xl border bg-card p-4 font-mono text-sm">
          <Row label={`Total Stunden`} value={`${hours.toFixed(2)} h`} />
          <Row label="Zwischentotal" value={formatCHF(subtotal)} />
          <Row label={`MWST ${vatRate}%`} value={formatCHF(vat)} />
          <div className="border-t pt-1"><Row label="Total inkl. MWST" value={formatCHF(subtotal + vat)} strong /></div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-medium text-primary" : ""}`}>
      <span className="font-sans text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
