import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { JobCard } from "@/components/JobCard";
import { customersQuery, jobsQuery } from "@/lib/queries";
import { address, customerName , isClosed } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/uebersicht")({
  head: () => ({
    meta: [
      { title: "Übersicht – Haustechnik Nordwestschweiz" },
      { name: "description", content: "Aktive Projekte, offene Serviceaufträge und zuletzt bearbeitete Aufträge." },
      { property: "og:title", content: "Übersicht – Haustechnik Nordwestschweiz" },
      { property: "og:description", content: "Aktive Projekte, offene Serviceaufträge und zuletzt bearbeitete Aufträge." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const jobs = useQuery(jobsQuery());
  const customers = useQuery(customersQuery());
  const [q, setQ] = useState("");

  const all = jobs.data ?? [];
  const active = all.filter((j) => j.job_type !== "service" && !isClosed(j.job_type, j.status));
  const openService = all.filter((j) => j.job_type === "service" && !isClosed(j.job_type, j.status));
  const recent = all.slice(0, 5);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    const js = all.filter((j) =>
      [j.title, customerName(j.customers), address(j)].join(" ").toLowerCase().includes(s),
    );
    const cs = (customers.data ?? []).filter((c) =>
      [customerName(c), c.city, c.phone].join(" ").toLowerCase().includes(s),
    );
    return { js, cs };
  }, [q, all, customers.data]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Link to="/baustellen/neu" search={{ typ: "project" }} className="flex h-16 items-center justify-center gap-2 rounded-xl bg-primary px-2 text-base font-semibold text-primary-foreground shadow-sm active:opacity-90">
          <Plus className="h-5 w-5" /> Neues Projekt
        </Link>
        <Link to="/baustellen/neu" search={{ typ: "service" }} className="flex h-16 items-center justify-center gap-2 rounded-xl border-2 border-primary bg-card px-2 text-base font-semibold text-primary active:opacity-90">
          <Plus className="h-5 w-5" /> Neuer Regieauftrag
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Auftrag oder Kunde suchen" className="h-12 bg-card pl-10 text-base" />
      </div>

      {results ? (
        <section className="space-y-3">
          <h2 className="section-title">Suchergebnisse</h2>
          {results.js.map((j) => <JobCard key={j.id} job={j} />)}
          {results.cs.map((c) => (
            <Link key={c.id} to="/kunden/$id" params={{ id: c.id }} className="flex h-14 items-center gap-3 rounded-xl border bg-card px-4 font-medium">
              <Users className="h-5 w-5 text-muted-foreground" /> {customerName(c)}
            </Link>
          ))}
          {!results.js.length && !results.cs.length && <p className="text-sm text-muted-foreground">Keine Treffer.</p>}
        </section>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Projekte" value={active.length} />
            <Stat label="Service offen" value={openService.length} />
            <Stat label="Kunden" value={customers.data?.length ?? 0} />
          </div>
          <section className="space-y-3">
            <h2 className="section-title">Aktive Projekte</h2>
            {jobs.isLoading && <p className="text-sm text-muted-foreground">Laden…</p>}
            {!jobs.isLoading && !active.length && (
              <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Keine aktiven Projekte.</p>
            )}
            {active.slice(0, 6).map((j) => <JobCard key={j.id} job={j} />)}
          </section>
          <section className="space-y-3">
            <h2 className="section-title">Offene Regie- / Serviceaufträge</h2>
            {!jobs.isLoading && !openService.length && (
              <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Keine offenen Serviceaufträge.</p>
            )}
            {openService.slice(0, 6).map((j) => <JobCard key={j.id} job={j} />)}
          </section>
          {recent.length > 0 && (
            <section className="space-y-3">
              <h2 className="section-title">Zuletzt bearbeitet</h2>
              {recent.map((j) => <JobCard key={j.id} job={j} />)}
            </section>
          )}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="section-title">Kunden</h2>
              <Link to="/kunden" className="text-sm font-semibold text-primary">Alle</Link>
            </div>
            <div className="divide-y rounded-xl border bg-card">
              {(customers.data ?? []).slice(0, 5).map((c) => (
                <Link key={c.id} to="/kunden/$id" params={{ id: c.id }} className="flex h-14 items-center justify-between px-4">
                  <span className="font-medium">{customerName(c)}</span>
                  <span className="text-sm text-muted-foreground">{c.city}</span>
                </Link>
              ))}
              {!customers.data?.length && <p className="p-4 text-sm text-muted-foreground">Noch keine Kunden.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="font-mono text-2xl font-medium text-primary">{value}</div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}
