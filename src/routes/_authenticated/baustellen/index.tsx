import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { JobCard } from "@/components/JobCard";
import { PageHeader } from "@/components/Brand";
import { Input } from "@/components/ui/input";
import { customersQuery, jobsQuery } from "@/lib/queries";
import { address, customerName } from "@/lib/app";
import { isActiveJob } from "@/lib/lifecycle";

export const Route = createFileRoute("/_authenticated/baustellen/")({
  head: () => ({
    meta: [
      { title: "Aufträge – Haustechnik Nordwestschweiz" },
      { name: "description", content: "Projekte und Regieaufträge nach Typ, Status und Kunde filtern." },
      { property: "og:title", content: "Aufträge – Haustechnik Nordwestschweiz" },
      { property: "og:description", content: "Projekte und Regieaufträge nach Typ, Status und Kunde filtern." },
    ],
  }),
  component: JobsPage,
});

type TypeFilter = "all" | "project" | "service";
type LifecycleFilter = "all" | "active" | "archived";

function JobsPage() {
  const { data, isLoading } = useQuery(jobsQuery());
  const customers = useQuery(customersQuery());
  const [type, setType] = useState<TypeFilter>("all");
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>("active");
  const [q, setQ] = useState("");
  const [customer, setCustomer] = useState("");
  const search = q.trim().toLowerCase();
  const list = (data ?? []).filter((j) => {
    const active = isActiveJob(j);
    return (
      (type === "all" || j.job_type === type) &&
      (lifecycle === "all" || (lifecycle === "active" ? active : !active)) &&
      (!customer || j.customer_id === customer) &&
      (!search || [j.title, customerName(j.customers), address(j), j.report_number].join(" ").toLowerCase().includes(search))
    );
  });
  return (
    <div>
      <PageHeader
        title="Aufträge"
        action={
          <Link to="/baustellen/neu" className="flex h-11 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
            <Plus className="h-5 w-5" /> Neu
          </Link>
        }
      />
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {([["all", "Alle"], ["project", "Projekte"], ["service", "Regie / Service"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setType(k)} className={`h-10 rounded-lg text-sm font-medium ${type === k ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {([["all", "Alle"], ["active", "Aktiv"], ["archived", "Archiviert"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setLifecycle(k)}
            className={`h-10 rounded-lg text-sm font-medium ${lifecycle === k ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>{label}</button>
        ))}
      </div>
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Auftrag, Kunde oder Rapportnummer" className="h-12 bg-card pl-10 text-base" />
        </div>
        <select value={customer} onChange={(e) => setCustomer(e.target.value)} className="h-12 w-full rounded-lg border border-input bg-card px-3 text-base">
          <option value="">Alle Kunden</option>
          {customers.data?.map((c) => <option key={c.id} value={c.id}>{customerName(c)}</option>)}
        </select>
      </div>
      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Laden…</p>}
        {list.map((j) => <JobCard key={j.id} job={j} />)}
        {!isLoading && !list.length && <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Keine Aufträge.</p>}
      </div>
    </div>
  );
}
