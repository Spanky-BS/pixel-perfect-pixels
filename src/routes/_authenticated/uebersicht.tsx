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
      <div>
        <p className="text-sm font-medium text-muted-foreground">{new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="text-3xl font-bold tracking-tight">Guete Morge Timo</h1>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/baustellen/neu" search={{ typ: "project" }} className="action-tile-primary min-h-28 items-start justify-between p-4 text-left text-base">
          <Plus className="h-6 w-6" /> <span>Neues Projekt</span>
        </Link>
        <Link to="/baustellen/neu" search={{ typ: "service" }} className="action-tile min-h-28 items-start justify-between p-4 text-left text-base text-primary">
          <Plus className="h-6 w-6" /> <span>Neuer Regieauftrag</span>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Auftrag oder Kunde suchen" className="h-12 rounded-2xl border-0 bg-card pl-11 text-base shadow-[var(--shadow-card)]" />
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
    <div className="surface p-4">
      <div className="font-mono text-2xl font-medium text-primary">{value}</div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}
