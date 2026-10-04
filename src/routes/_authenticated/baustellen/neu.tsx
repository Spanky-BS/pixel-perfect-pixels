import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { HardHat, Wrench } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/Brand";
import { CustomerFields, Field, useCustomerDraft } from "@/components/CustomerForm";
import { customersQuery } from "@/lib/queries";
import { customerName } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/baustellen/neu")({
  validateSearch: (s: Record<string, unknown>): { kunde?: string; typ?: "project" | "service" } => ({
    ...(typeof s["kunde"] === "string" ? { kunde: s["kunde"] as string } : {}),
    ...(s["typ"] === "project" || s["typ"] === "service" ? { typ: s["typ"] as "project" | "service" } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Neuer Auftrag – Haustechnik Nordwestschweiz" },
      { name: "description", content: "Neues Projekt oder neuen Regieauftrag erfassen." },
      { property: "og:title", content: "Neuer Auftrag – Haustechnik Nordwestschweiz" },
      { property: "og:description", content: "Neues Projekt oder neuen Regieauftrag erfassen." },
    ],
  }),
  component: NewJob,
});

function NewJob() {
  const { kunde, typ } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const customers = useQuery(customersQuery());
  const [mode, setMode] = useState<"existing" | "new" | "none">("existing");
  const [customerId, setCustomerId] = useState<string>(kunde ?? "");
  const [draft, setDraft] = useCustomerDraft();
  const [title, setTitle] = useState("");
  const [street, setStreet] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = customers.data?.find((x) => x.id === id);
    if (c && !street && !city) {
      setStreet(c.street ?? "");
      setZip(c.zip ?? "");
      setCity(c.city ?? "");
    }
  }

  if (!typ) return <TypeChooser kunde={kunde} />;
  const service = typ === "service";

  async function save() {
    if (!title.trim()) return toast.error(service ? "Titel fehlt" : "Projekttitel fehlt");
    if (mode === "existing" && !customerId) return toast.error("Bitte Kunde wählen oder «Ohne Kunde fortfahren»");
    setBusy(true);
    try {
      let cid: string | null = mode === "existing" ? customerId || null : null;
      if (mode === "new") {
        const { data, error } = await supabase.from("customers").insert(draft).select("id").single();
        if (error) throw error;
        cid = data.id;
      }
      const { data, error } = await supabase
        .from("jobs")
        .insert({
          title: title.trim(),
          customer_id: cid,
          street: street || (mode === "new" ? draft.street : null),
          zip: zip || (mode === "new" ? draft.zip : null),
          city: city || (mode === "new" ? draft.city : null),
          job_type: service ? "service" : "project",
          ...(service ? { problem_description: notes } : { notes }),
          status: service ? "Neu" : "Begehung",
        })
        .select("id")
        .single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      navigate({ to: "/baustellen/$id", params: { id: data.id }, replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={service ? "Neuer Regieauftrag" : "Neues Projekt"} />
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="section-title">1 · Kunde</h2>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          {(["existing", "new"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`h-11 rounded-md text-sm font-semibold ${mode === m ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              {m === "existing" ? "Bestehender Kunde" : "+ Neuer Kunde"}
            </button>
          ))}
        </div>
        {mode === "none" ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Auftrag wird ohne Kunde angelegt. Kunde kann später zugeordnet werden.</p>
        ) : mode === "existing" ? (
          <select
            value={customerId}
            onChange={(e) => pickCustomer(e.target.value)}
            className="h-12 w-full rounded-md border border-input bg-card px-3 text-base"
          >
            <option value="">Kunde wählen…</option>
            {customers.data?.map((c) => (
              <option key={c.id} value={c.id}>{customerName(c)}{c.city ? ` – ${c.city}` : ""}</option>
            ))}
          </select>
        ) : (
          <CustomerFields value={draft} onChange={setDraft} />
        )}
        <button onClick={() => setMode(mode === "none" ? "existing" : "none")} className="h-10 w-full text-sm font-medium text-muted-foreground underline">
          {mode === "none" ? "Doch Kunde zuordnen" : "Ohne Kunde fortfahren"}
        </button>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="section-title">2 · {service ? "Regieauftrag" : "Baustelle / Projekt"}</h2>
        <Field label={service ? "Titel" : "Projekttitel"}><Input className="h-12 text-base" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={service ? "z.B. WC-Spülung defekt" : "z.B. Badsanierung OG"} /></Field>
        <Field label="Strasse (Einsatzort)"><Input className="h-12 text-base" value={street} onChange={(e) => setStreet(e.target.value)} placeholder={mode === "new" ? "leer = Kundenadresse" : ""} /></Field>
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label="PLZ"><Input className="h-12 text-base" inputMode="numeric" value={zip} onChange={(e) => setZip(e.target.value)} /></Field>
          <Field label="Ort"><Input className="h-12 text-base" value={city} onChange={(e) => setCity(e.target.value)} /></Field>
        </div>
        <Field label={service ? "Problem / Auftrag" : "Notizen"}><Textarea className="min-h-20 text-base" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </section>

      <Button onClick={save} disabled={busy} className="h-14 w-full text-base font-semibold">{service ? "Regieauftrag anlegen" : "Projekt anlegen"}</Button>
    </div>
  );
}

function TypeChooser({ kunde }: { kunde?: string | undefined }) {
  const opts = [
    { typ: "project" as const, icon: HardHat, title: "Projekt / Baustelle", text: "Bestandesaufnahme, Analyse, optionale Grobkostenschätzung, Produktauswahl, Kalkulation, Offerte." },
    { typ: "service" as const, icon: Wrench, title: "Regie / Service", text: "Reparatur oder Service: Auftrag erfassen, effektive Stunden und Material, Abschluss." },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Was möchtest du erstellen?" />
      {opts.map((o) => (
        <Link key={o.typ} to="/baustellen/neu" search={{ typ: o.typ, ...(kunde ? { kunde } : {}) }}
          className="flex items-start gap-4 rounded-xl border-2 bg-card p-5 active:border-primary">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><o.icon className="h-7 w-7" /></div>
          <div>
            <div className="text-lg font-bold">{o.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{o.text}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
