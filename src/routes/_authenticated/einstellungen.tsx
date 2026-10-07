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
import { categoriesQuery, productsQuery, settingsQuery } from "@/lib/queries";
import { formatCHF, requireUserId, signedUrls, uploadProfileMedia, BUCKET } from "@/lib/app";
import { matchesProduct, type Product } from "@/lib/products";
import { ProductEditor, type ProductDraft } from "@/components/job/ProductEditor";
import { SignaturePad } from "@/components/job/ServiceSections";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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
  const [s, setS] = useState({
    company_name: "Haustechnik Nordwestschweiz",
    vat_rate: 8.1,
    default_hourly_rate: 120,
    default_material_markup: 0,
    estimate_tolerance: 20,
    estimate_vehicle_per_day: 50,
    estimate_small_material_pct: 5,
    service_hourly_rate: 120,
    travel_rate: 120,
    vehicle_fee: 0,
    small_material_allowance: 0,
    default_technician: "Timo Simonato",
    technician_role: "Monteur",
    technician_phone: "",
    technician_email: "",
    technician_street: "",
    technician_zip: "",
    technician_city: "",
  });

  useEffect(() => {
    if (settings.data) setS({
      company_name: settings.data.company_name,
      vat_rate: Number(settings.data.vat_rate),
      default_hourly_rate: Number(settings.data.default_hourly_rate),
      default_material_markup: Number(settings.data.default_material_markup),
      estimate_tolerance: Number(settings.data.estimate_tolerance),
      estimate_vehicle_per_day: Number(settings.data.estimate_vehicle_per_day),
      estimate_small_material_pct: Number(settings.data.estimate_small_material_pct),
      service_hourly_rate: Number(settings.data.service_hourly_rate),
      travel_rate: Number(settings.data.travel_rate),
      vehicle_fee: Number(settings.data.vehicle_fee),
      small_material_allowance: Number(settings.data.small_material_allowance),
      default_technician: settings.data.default_technician?.trim() || "Timo Simonato",
      technician_role: settings.data.technician_role?.trim() || "Monteur",
      technician_phone: settings.data.technician_phone ?? "",
      technician_email: settings.data.technician_email ?? "",
      technician_street: settings.data.technician_street ?? "",
      technician_zip: settings.data.technician_zip ?? "",
      technician_city: settings.data.technician_city ?? "",
    });
  }, [settings.data]);

  async function saveCompany() {
    const user_id = await requireUserId();
    const { error } = await supabase.from("settings").upsert({
      user_id,
      company_name: s.company_name,
      vat_rate: s.vat_rate,
      default_material_markup: s.default_material_markup,
      estimate_tolerance: s.estimate_tolerance,
      estimate_vehicle_per_day: s.estimate_vehicle_per_day,
      estimate_small_material_pct: s.estimate_small_material_pct,
      currency: "CHF",
    });
    if (error) return toast.error(error.message);
    toast.success("Firmeneinstellungen gespeichert");
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
      <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4">
        <h2 className="section-title">Firma</h2>
        <Field label="Firma"><Input className="h-12 text-base" value={s.company_name} onChange={(e) => setS({ ...s, company_name: e.target.value })} /></Field>
        <Field label="Währung"><Input className="h-12 text-base" value="CHF" disabled /></Field>
        <Button className="h-12 w-full font-medium" onClick={saveCompany}>Firma speichern</Button>
      </section>

      <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4">
        <h2 className="section-title">Preise & Kalkulation</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="MWST %"><Input className="h-12 text-base" type="number" step="0.1" inputMode="decimal" value={s.vat_rate} onChange={(e) => setS({ ...s, vat_rate: Number(e.target.value) })} /></Field>
          <Field label="Grobkosten-Toleranz %"><Input className="h-12 text-base" type="number" inputMode="decimal" value={s.estimate_tolerance} onChange={(e) => setS({ ...s, estimate_tolerance: Number(e.target.value) })} /></Field>
          <Field label="Grobkosten: Fahrzeug CHF pro Tag (8 h)"><Input className="h-12 text-base" type="number" inputMode="decimal" value={s.estimate_vehicle_per_day} onChange={(e) => setS({ ...s, estimate_vehicle_per_day: Number(e.target.value) })} /></Field>
          <Field label="Grobkosten: Kleinmaterial %"><Input className="h-12 text-base" type="number" inputMode="decimal" value={s.estimate_small_material_pct} onChange={(e) => setS({ ...s, estimate_small_material_pct: Number(e.target.value) })} /></Field>
          <Field label="Materialzuschlag %"><Input className="h-12 text-base" type="number" inputMode="decimal" value={s.default_material_markup} onChange={(e) => setS({ ...s, default_material_markup: Number(e.target.value) })} /></Field>
        </div>
        <Button className="h-12 w-full font-medium" onClick={saveCompany}>Preise speichern</Button>
      </section>

      <EmployeeProfile
        s={s}
        setS={(p) => setS((cur) => ({ ...cur, ...p }))}
        signaturePath={settings.data?.technician_signature_path ?? null}
      />

      <details className="rounded-2xl border border-border/70 bg-card p-4">
        <summary className="cursor-pointer text-base font-semibold">Produkte & Material</summary>
        <p className="mt-2 text-sm text-muted-foreground">Materialkategorien und interne Produktbibliothek.</p>
        <div className="mt-4 space-y-4">
          <Categories />
          <ProductLibrary />
        </div>
      </details>

      <details className="rounded-2xl border border-border/70 bg-card p-4">
        <summary className="cursor-pointer text-base font-semibold">Integrationen</summary>
        <p className="mt-3 text-sm text-muted-foreground">
          Live-Lieferanten und Bexio sind vorbereitet, aber nicht Teil des Testbetriebs. Die App funktioniert vollständig mit der eigenen Produktbibliothek.
        </p>
      </details>

      <Button variant="outline" className="h-12 w-full" onClick={logout}><LogOut className="h-4 w-4" /> Abmelden</Button>
    </div>
  );
}

type ProfileState = {
  default_hourly_rate: number;
  service_hourly_rate: number;
  vehicle_fee: number;
  small_material_allowance: number;
  default_technician: string;
  technician_role: string;
  technician_phone: string;
  technician_email: string;
  technician_street: string;
  technician_zip: string;
  technician_city: string;
};

function blank(v: string) {
  const t = v.trim();
  return t || null;
}

function EmployeeProfile({
  s,
  setS,
  signaturePath,
}: {
  s: ProfileState;
  setS: (patch: Partial<ProfileState>) => void;
  signaturePath: string | null;
}) {
  const qc = useQueryClient();
  const [sigOpen, setSigOpen] = useState(false);
  const sig = useQuery({
    queryKey: ["sig", signaturePath],
    enabled: !!signaturePath,
    queryFn: async () => (await signedUrls([signaturePath!]))[signaturePath!] ?? null,
  });

  async function saveProfile() {
    const user_id = await requireUserId();
    const n = Number(s.default_hourly_rate);
    const { error } = await supabase.from("settings").upsert({
      user_id,
      default_technician: s.default_technician.trim() || "Timo Simonato",
      technician_role: s.technician_role.trim() || "Monteur",
      technician_phone: blank(s.technician_phone),
      technician_email: blank(s.technician_email),
      technician_street: blank(s.technician_street),
      technician_zip: blank(s.technician_zip),
      technician_city: blank(s.technician_city),
      default_hourly_rate: n,
      service_hourly_rate: n,
      vehicle_fee: Number(s.vehicle_fee),
      small_material_allowance: Number(s.small_material_allowance),
      currency: "CHF",
    });
    if (error) return toast.error(error.message);
    toast.success("Stammdaten gespeichert");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  async function storeSignature(blob: Blob) {
    const user_id = await requireUserId();
    const path = await uploadProfileMedia(blob, "png");
    if (signaturePath) await supabase.storage.from(BUCKET).remove([signaturePath]);
    const { error } = await supabase.from("settings").upsert({
      user_id,
      technician_signature_path: path,
      currency: "CHF",
    });
    if (error) return toast.error(error.message);
    toast.success("Unterschrift gespeichert");
    setSigOpen(false);
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  async function clearSignature() {
    if (!signaturePath || !confirm("Unterschrift entfernen?")) return;
    const user_id = await requireUserId();
    await supabase.storage.from(BUCKET).remove([signaturePath]);
    const { error } = await supabase.from("settings").upsert({
      user_id,
      technician_signature_path: null,
      currency: "CHF",
    });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border/70 bg-card p-4">
      <div>
        <h2 className="section-title">Timo / Stammdaten</h2>
        <p className="mt-1 text-sm text-muted-foreground">Vorgaben für Regie, Rapporte und Unterschrift. Erfasste Auftragswerte bleiben unverändert.</p>
      </div>

      <h3 className="text-sm font-medium text-muted-foreground">Person</h3>
      <Field label="Name"><Input className="h-12 text-base" value={s.default_technician} onChange={(e) => setS({ default_technician: e.target.value })} /></Field>
      <Field label="Funktion"><Input className="h-12 text-base" value={s.technician_role} onChange={(e) => setS({ technician_role: e.target.value })} /></Field>

      <h3 className="text-sm font-medium text-muted-foreground">Kontakt</h3>
      <Field label="Telefon"><Input className="h-12 text-base" type="tel" value={s.technician_phone} onChange={(e) => setS({ technician_phone: e.target.value })} /></Field>
      <Field label="E-Mail"><Input className="h-12 text-base" type="email" value={s.technician_email} onChange={(e) => setS({ technician_email: e.target.value })} /></Field>

      <h3 className="text-sm font-medium text-muted-foreground">Adresse</h3>
      <Field label="Strasse"><Input className="h-12 text-base" value={s.technician_street} onChange={(e) => setS({ technician_street: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="PLZ"><Input className="h-12 text-base" value={s.technician_zip} onChange={(e) => setS({ technician_zip: e.target.value })} /></Field>
        <Field label="Ort"><Input className="h-12 text-base" value={s.technician_city} onChange={(e) => setS({ technician_city: e.target.value })} /></Field>
      </div>

      <h3 className="border-t pt-4 text-sm font-medium text-muted-foreground">Preise & Pauschalen</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Standard-Stundensatz CHF">
          <Input
            className="h-12 text-base"
            type="number"
            inputMode="decimal"
            value={s.default_hourly_rate}
            onChange={(e) => {
              const n = Number(e.target.value);
              setS({ default_hourly_rate: n, service_hourly_rate: n });
            }}
          />
        </Field>
        <Field label="Fahrzeugpauschale CHF"><Input className="h-12 text-base" type="number" inputMode="decimal" value={s.vehicle_fee} onChange={(e) => setS({ vehicle_fee: Number(e.target.value) })} /></Field>
        <Field label="Kleinmaterial CHF"><Input className="h-12 text-base" type="number" inputMode="decimal" value={s.small_material_allowance} onChange={(e) => setS({ small_material_allowance: Number(e.target.value) })} /></Field>
      </div>

      <h3 className="border-t pt-4 text-sm font-medium text-muted-foreground">Digitale Unterschrift</h3>
      {sig.data ? (
        <img src={sig.data} alt="Unterschrift" className="h-[68px] w-[170px] object-contain object-left bg-muted/40" />
      ) : (
        <p className="text-sm text-muted-foreground">Keine Unterschrift hinterlegt</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-12" onClick={() => setSigOpen(true)}>{signaturePath ? "Neu erfassen" : "Unterschrift erfassen"}</Button>
        <label className="flex h-12 cursor-pointer items-center justify-center rounded-md border bg-card text-sm font-semibold">
          Bild hochladen
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) await storeSignature(f);
            }}
          />
        </label>
      </div>
      {signaturePath && (
        <button type="button" className="text-sm font-semibold text-destructive" onClick={() => void clearSignature()}>Unterschrift entfernen</button>
      )}

      <Button className="h-12 w-full font-medium" onClick={() => void saveProfile()}>Stammdaten speichern</Button>

      <Sheet open={sigOpen} onOpenChange={setSigOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Unterschrift erfassen</SheetTitle></SheetHeader>
          {sigOpen && <SignaturePad onSave={(b) => void storeSignature(b)} />}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function ProductLibrary() {
  const qc = useQueryClient();
  const products = useQuery(productsQuery());
  const cats = useQuery(categoriesQuery());
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const catName = (id: string | null) => cats.data?.find((c) => c.id === id)?.name ?? "";
  const list = (products.data ?? []).filter((p) => matchesProduct(p, q, catName(p.category_id)));

  async function remove(p: Product) {
    if (!confirm(`«${p.name}» deaktivieren?`)) return;
    await supabase.from("products").update({ active: false }).eq("id", p.id);
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  return (
    <section className="space-y-3 rounded-xl bg-muted/40 p-4">
      <h2 className="section-title">Produktbibliothek</h2>
      <Input className="h-12 text-base" placeholder="Suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
      <Button className="h-12 w-full font-semibold" onClick={() => setDraft({ name: "", unit: "Stk" })}>+ Produkt anlegen</Button>
      {!list.length && <p className="text-sm text-muted-foreground">Noch keine Produkte. Manuell anlegen – ohne Lieferantenanbindung.</p>}
      <div className="space-y-2">
        {list.map((p) => (
          <div key={p.id} className="rounded-lg border p-3">
            <div className="font-semibold">{p.name}</div>
            <div className="text-sm text-muted-foreground">{[catName(p.category_id), p.manufacturer, p.manufacturer_article_no].filter(Boolean).join(" · ")}</div>
            <div className="mt-1 font-mono text-sm">EK {p.purchase_price != null ? formatCHF(Number(p.purchase_price)) : "–"}</div>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" className="h-10 flex-1" onClick={() => setDraft(p)}>Bearbeiten</Button>
              <Button variant="outline" className="h-10 text-destructive" onClick={() => remove(p)}>Entfernen</Button>
            </div>
          </div>
        ))}
      </div>
      <ProductEditor
        key={draft ? (draft.id ?? "new") : "none"}
        draft={draft}
        categories={cats.data}
        onClose={() => setDraft(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["products"] })}
      />
    </section>
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
    <section className="space-y-3 rounded-xl bg-muted/40 p-4">
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
