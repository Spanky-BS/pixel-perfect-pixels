import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { JobCard } from "@/components/JobCard";
import { jobsQuery } from "@/lib/queries";
import { address, customerName } from "@/lib/app";
import { isActiveJob } from "@/lib/lifecycle";

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
  const [q, setQ] = useState("");

  const all = (jobs.data ?? []).filter(isActiveJob);
  const active = all.filter((j) => j.job_type !== "service");
  const openService = all.filter((j) => j.job_type === "service");
  const recent = [...all].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    return all.filter((j) =>
      [j.title, customerName(j.customers), address(j)].join(" ").toLowerCase().includes(s),
    );
  }, [q, all]);

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
          {results.map((j) => <JobCard key={j.id} job={j} />)}
          {!results.length && <p className="text-sm text-muted-foreground">Keine Treffer in den aktiven Aufträgen.</p>}
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Aktive Projekte" value={active.length} />
            <Stat label="Service offen" value={openService.length} />
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
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="font-mono text-2xl font-medium text-primary">{value}</div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}
