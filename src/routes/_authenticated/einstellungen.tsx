import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, LogOut, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/CustomerForm";
import { PageHeader } from "@/components/Brand";
import { IconBtn } from "@/components/job/MaterialList";
import { categoriesQuery, settingsQuery } from "@/lib/queries";
import { requireUserId } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/einstellungen")({
  head: () => ({
    meta: [
      { title: "Einstellungen – Haustechnik Nordwestschweiz" },
      { name: "description", content: "MWST, Stundenansatz und Materialkategorien verwalten." },
      { property: "og:title", content: "Einstellungen – Haustechnik Nordwestschweiz" },
      { property: "og:description", content: "MWST, Stundenansatz und Materialkategorien verwalten." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const settings = useQuery(settingsQuery());
  const [s, setS] = useState({ company_name: "Haustechnik Nordwestschweiz", vat_rate: 8.1, default_hourly_rate: 120, default_material_markup: 0, estimate_tolerance: 20, service_hourly_rate: 120, travel_rate: 120, vehicle_fee: 0, small_material_allowance: 0 });

  useEffect(() => {
    if (settings.data) setS({
      company_name: settings.data.company_name,
      vat_rate: Number(settings.data.vat_rate),
      default_hourly_rate: Number(settings.data.default_hourly_rate),
      default_material_markup: Number(settings.data.default_material_markup),
      estimate_tolerance: Number(settings.data.estimate_tolerance),
      service_hourly_rate: Number(settings.data.service_hourly_rate),
      travel_rate: Number(settings.data.travel_rate),
      vehicle_fee: Number(settings.data.vehicle_fee),
      small_material_allowance: Number(settings.data.small_material_allowance),
    });
  }, [settings.data]);

  async function save() {
    const user_id = await requireUserId();
    const { error } = await supabase.from("settings").upsert({ user_id, ...s, currency: "CHF" });
    if (error) return toast.error(error.message);
    toast.success("Einstellungen gespeichert");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  async function logout() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Einstellungen" />
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="section-title">Firma & Allgemein</h2>
        <Field label="Firma"><Input className="h-12 text-base" value={s.company_name} onChange={(e) => setS({ ...s, company_name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Währung"><Input className="h-12 text-base" value="CHF" disabled /></Field>
          <Field label="MWST %"><Input className="h-12 text-base" type="number" step="0.1" inputMode="decimal" value={s.vat_rate} onChange={(e) => setS({ ...s, vat_rate: Number(e.target.value) })} /></Field>
          <Field label="Stundenansatz CHF"><Input className="h-12 text-base" type="number" inputMode="decimal" value={s.default_hourly_rate} onChange={(e) => setS({ ...s, default_hourly_rate: Number(e.target.value) })} /></Field>
          <Field label="Toleranz Grobkosten %"><Input className="h-12 text-base" type="number" inputMode="decimal" value={s.estimate_tolerance} onChange={(e) => setS({ ...s, estimate_tolerance: Number(e.target.value) })} /></Field>
          <Field label="Materialzuschlag %"><Input className="h-12 text-base" type="number" inputMode="decimal" value={s.default_material_markup} onChange={(e) => setS({ ...s, default_material_markup: Number(e.target.value) })} /></Field>
        </div>
        <h2 className="section-title pt-2">Regie / Service</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Service-Ansatz CHF/h"><Input className="h-12 text-base" type="number" inputMode="decimal" value={s.service_hourly_rate} onChange={(e) => setS({ ...s, service_hourly_rate: Number(e.target.value) })} /></Field>
          <Field label="Fahrtzeit CHF/h"><Input className="h-12 text-base" type="number" inputMode="decimal" value={s.travel_rate} onChange={(e) => setS({ ...s, travel_rate: Number(e.target.value) })} /></Field>
          <Field label="Fahrzeugpauschale CHF"><Input className="h-12 text-base" type="number" inputMode="decimal" value={s.vehicle_fee} onChange={(e) => setS({ ...s, vehicle_fee: Number(e.target.value) })} /></Field>
          <Field label="Kleinmaterial CHF"><Input className="h-12 text-base" type="number" inputMode="decimal" value={s.small_material_allowance} onChange={(e) => setS({ ...s, small_material_allowance: Number(e.target.value) })} /></Field>
        </div>
        <Button className="h-12 w-full font-semibold" onClick={save}>Speichern</Button>
      </section>

      <Categories />

      <section className="space-y-2 rounded-xl border bg-card p-4">
        <h2 className="section-title">Lieferanten</h2>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div><div className="font-semibold">Richner</div><div className="text-xs text-muted-foreground">Bevorzugt · Priorität 1</div></div>
          <span className="rounded bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">nicht verbunden</span>
        </div>
        <p className="text-sm text-muted-foreground">Lieferanten-Anbindung, Preisvergleich und Bexio folgen in einer späteren Phase.</p>
      </section>

      <Button variant="outline" className="h-12 w-full" onClick={logout}><LogOut className="h-4 w-4" /> Abmelden</Button>
    </div>
  );
}

function Categories() {
  const qc = useQueryClient();
  const { data } = useQuery(categoriesQuery());
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const list = data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["categories"] });

  async function add() {
    if (!name.trim()) return;
    await supabase.from("material_categories").insert({ name: name.trim(), sort_order: list.length + 1 });
    setName("");
    refresh();
  }
  async function rename(id: string) {
    if (editName.trim()) await supabase.from("material_categories").update({ name: editName.trim() }).eq("id", id);
    setEditId(null);
    refresh();
  }
  async function remove(id: string) {
    if (!confirm("Kategorie löschen? Zugeordnete Positionen werden ohne Kategorie weitergeführt.")) return;
    await supabase.from("material_categories").delete().eq("id", id);
    refresh();
  }
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    await Promise.all(list.map((c, k) => {
      const target = (k === i ? j : k === j ? i : k) + 1;
      return c.sort_order !== target ? supabase.from("material_categories").update({ sort_order: target }).eq("id", c.id) : null;
    }));
    refresh();
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="section-title">Materialkategorien</h2>
      <div className="flex gap-2">
        <Input className="h-12 text-base" placeholder="Neue Kategorie" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button className="h-12 px-5" onClick={add}>Hinzufügen</Button>
      </div>
      <div className="divide-y rounded-lg border">
        {list.map((c, i) => (
          <div key={c.id} className="flex items-center gap-1 px-3 py-2">
            {editId === c.id ? (
              <>
                <Input autoFocus className="h-10 flex-1" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && rename(c.id)} />
                <IconBtn label="Übernehmen" onClick={() => rename(c.id)}><Check className="h-4 w-4" /></IconBtn>
              </>
            ) : (
              <>
                <span className="flex-1 truncate font-medium">{c.name}</span>
                <IconBtn label="Nach oben" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></IconBtn>
                <IconBtn label="Nach unten" onClick={() => move(i, 1)} disabled={i === list.length - 1}><ArrowDown className="h-4 w-4" /></IconBtn>
                <IconBtn label="Umbenennen" onClick={() => { setEditId(c.id); setEditName(c.name); }}><Pencil className="h-4 w-4" /></IconBtn>
                <IconBtn label="Löschen" onClick={() => remove(c.id)} danger><Trash2 className="h-4 w-4" /></IconBtn>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
