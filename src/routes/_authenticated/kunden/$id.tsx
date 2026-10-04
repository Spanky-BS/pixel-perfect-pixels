import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { ChevronLeft, Phone, Mail, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CustomerFields, emptyCustomer, useCustomerDraft } from "@/components/CustomerForm";
import { JobCard, type JobWithCustomer } from "@/components/JobCard";
import { customerName } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/kunden/$id")({
  head: () => ({
    meta: [
      { title: "Kunde – Haustechnik Nordwestschweiz" },
      { name: "description", content: "Kundendaten und zugehörige Baustellen." },
      { property: "og:title", content: "Kunde – Haustechnik Nordwestschweiz" },
      { property: "og:description", content: "Kundendaten und zugehörige Baustellen." },
    ],
  }),
  component: CustomerPage,
});

function CustomerPage() {
  const { id } = Route.useParams();
  const isNew = id === "neu";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useCustomerDraft();

  const customer = useQuery({
    queryKey: ["customer", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const jobs = useQuery({
    queryKey: ["customer-jobs", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*, customers(company_name, first_name, last_name)").eq("customer_id", id).order("updated_at", { ascending: false });
      if (error) throw error;
      return data as JobWithCustomer[];
    },
  });

  useEffect(() => {
    const c = customer.data;
    if (c) {
      const next = { ...emptyCustomer };
      (Object.keys(next) as (keyof typeof next)[]).forEach((k) => (next[k] = c[k] ?? ""));
      setDraft(next);
    }
  }, [customer.data, setDraft]);

  async function save() {
    if (!draft.company_name && !draft.last_name) return toast.error("Name oder Firma angeben");
    if (isNew) {
      const { data, error } = await supabase.from("customers").insert(draft).select("id").single();
      if (error) return toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["customers"] });
      navigate({ to: "/kunden/$id", params: { id: data.id }, replace: true });
    } else {
      const { error } = await supabase.from("customers").update(draft).eq("id", id);
      if (error) return toast.error(error.message);
      toast.success("Gespeichert");
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer", id] });
    }
  }
  async function remove() {
    if (!confirm("Kunde löschen? Baustellen bleiben ohne Kunde erhalten.")) return;
    await supabase.from("customers").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["customers"] });
    navigate({ to: "/kunden" });
  }

  return (
    <div className="space-y-4">
      <Link to="/kunden" className="-ml-1 inline-flex h-10 items-center text-sm font-medium text-muted-foreground">
        <ChevronLeft className="h-5 w-5" /> Kunden
      </Link>
      <h1 className="text-2xl font-bold">{isNew ? "Neuer Kunde" : customerName(customer.data)}</h1>
      {!isNew && (customer.data?.phone || customer.data?.email) && (
        <div className="grid grid-cols-2 gap-3">
          {customer.data?.phone && <a href={`tel:${customer.data.phone}`} className="flex h-12 items-center justify-center gap-2 rounded-lg border bg-card font-medium"><Phone className="h-5 w-5 text-primary" /> Anrufen</a>}
          {customer.data?.email && <a href={`mailto:${customer.data.email}`} className="flex h-12 items-center justify-center gap-2 rounded-lg border bg-card font-medium"><Mail className="h-5 w-5 text-primary" /> E-Mail</a>}
        </div>
      )}
      {!isNew && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Baustellen ({jobs.data?.length ?? 0})</h2>
            <Link to="/baustellen/neu" search={{ kunde: id }} className="flex h-10 items-center gap-1 text-sm font-semibold text-primary"><Plus className="h-4 w-4" /> Neue Baustelle</Link>
          </div>
          {jobs.data?.map((j) => <JobCard key={j.id} job={j} />)}
        </section>
      )}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="section-title mb-3">Kundendaten</h2>
        <CustomerFields value={draft} onChange={setDraft} />
        <Button className="mt-4 h-12 w-full font-semibold" onClick={save}>{isNew ? "Kunde anlegen" : "Speichern"}</Button>
        {!isNew && <Button variant="outline" className="mt-3 h-12 w-full text-destructive" onClick={remove}><Trash2 className="h-4 w-4" /> Kunde löschen</Button>}
      </section>
    </div>
  );
}
