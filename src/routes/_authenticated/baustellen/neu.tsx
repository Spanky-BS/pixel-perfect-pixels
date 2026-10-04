import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  validateSearch: (s: Record<string, unknown>) => ({ kunde: typeof s.kunde === "string" ? s.kunde : undefined }),
  head: () => ({
    meta: [
      { title: "Neue Baustelle – Haustechnik Nordwestschweiz" },
      { name: "description", content: "Neue Baustelle erfassen." },
      { property: "og:title", content: "Neue Baustelle – Haustechnik Nordwestschweiz" },
      { property: "og:description", content: "Neue Baustelle erfassen." },
    ],
  }),
  component: NewJob,
});

function NewJob() {
  const { kunde } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const customers = useQuery(customersQuery());
  const [mode, setMode] = useState<"existing" | "new">("existing");
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

  async function save() {
    if (!title.trim()) return toast.error("Projekttitel fehlt");
    setBusy(true);
    try {
      let cid: string | null = customerId || null;
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
          notes,
          status: "Aufnahme",
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
      <PageHeader title="Neue Baustelle" />
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="section-title">1 · Kunde</h2>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          {(["existing", "new"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`h-10 rounded-md text-sm font-semibold ${mode === m ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              {m === "existing" ? "Bestehend" : "Neu erfassen"}
            </button>
          ))}
        </div>
        {mode === "existing" ? (
          <select
            value={customerId}
            onChange={(e) => pickCustomer(e.target.value)}
            className="h-12 w-full rounded-md border border-input bg-card px-3 text-base"
          >
            <option value="">Ohne Kunde</option>
            {customers.data?.map((c) => (
              <option key={c.id} value={c.id}>{customerName(c)}{c.city ? ` – ${c.city}` : ""}</option>
            ))}
          </select>
        ) : (
          <CustomerFields value={draft} onChange={setDraft} />
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="section-title">2 · Baustelle</h2>
        <Field label="Projekttitel"><Input className="h-12 text-base" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z.B. Badsanierung OG" /></Field>
        <Field label="Strasse (Baustelle)"><Input className="h-12 text-base" value={street} onChange={(e) => setStreet(e.target.value)} placeholder={mode === "new" ? "leer = Kundenadresse" : ""} /></Field>
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label="PLZ"><Input className="h-12 text-base" inputMode="numeric" value={zip} onChange={(e) => setZip(e.target.value)} /></Field>
          <Field label="Ort"><Input className="h-12 text-base" value={city} onChange={(e) => setCity(e.target.value)} /></Field>
        </div>
        <Field label="Notizen"><Textarea className="min-h-20 text-base" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </section>

      <Button onClick={save} disabled={busy} className="h-14 w-full text-base font-semibold">Baustelle anlegen</Button>
    </div>
  );
}
