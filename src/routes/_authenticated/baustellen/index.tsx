import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { JobCard } from "@/components/JobCard";
import { PageHeader } from "@/components/Brand";
import { customersQuery, jobsQuery } from "@/lib/queries";
import { PROJECT_STEPS, SERVICE_STEPS, customerName, normalizeStatus } from "@/lib/app";

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

function JobsPage() {
  const { data, isLoading } = useQuery(jobsQuery());
  const customers = useQuery(customersQuery());
  const [type, setType] = useState<TypeFilter>("all");
  const [status, setStatus] = useState("Alle");
  const [customer, setCustomer] = useState("");
  const statuses = type === "service" ? SERVICE_STEPS : type === "project" ? PROJECT_STEPS : [...new Set([...PROJECT_STEPS, ...SERVICE_STEPS])];
  const list = (data ?? []).filter((j) =>
    (type === "all" || j.job_type === type) &&
    (status === "Alle" || normalizeStatus(j.job_type, j.status) === status) &&
    (!customer || j.customer_id === customer),
  );
  return (
    <div>
      <PageHeader
        title="Aufträge"
        action={
          <Link to="/baustellen/neu" className="flex h-11 items-center gap-1 rounded-lg bg-primary px-4 font-semibold text-primary-foreground">
            <Plus className="h-5 w-5" /> Neu
          </Link>
        }
      />
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {([["all", "Alle"], ["project", "Projekte"], ["service", "Regie / Service"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setType(k); setStatus("Alle"); }} className={`h-10 rounded-md text-sm font-semibold ${type === k ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {["Alle", ...statuses].map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`h-10 shrink-0 rounded-full border px-4 text-sm font-medium ${status === s ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{s}</button>
        ))}
      </div>
      <select value={customer} onChange={(e) => setCustomer(e.target.value)} className="mb-4 h-12 w-full rounded-md border border-input bg-card px-3 text-base">
        <option value="">Alle Kunden</option>
        {customers.data?.map((c) => <option key={c.id} value={c.id}>{customerName(c)}</option>)}
      </select>
      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Laden…</p>}
        {list.map((j) => <JobCard key={j.id} job={j} />)}
        {!isLoading && !list.length && <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Keine Aufträge.</p>}
      </div>
    </div>
  );
}
