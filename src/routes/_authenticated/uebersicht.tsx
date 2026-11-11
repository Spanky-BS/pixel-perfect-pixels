import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FolderPlus, Search, Wrench, X, FileText, HardHat, Hammer, ClipboardList } from "lucide-react";
import { Input } from "@/components/ui/input";
import { JobCard, jobBadge } from "@/components/JobCard";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? "Guten Morgen" : h < 17 ? "Guten Tag" : "Guten Abend";
}

function Dashboard() {
  const jobs = useQuery(jobsQuery());
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string | null>(null);

  const all = (jobs.data ?? []).filter(isActiveJob);
  const projects = all.filter((j) => j.job_type !== "service");
  const services = all.filter((j) => j.job_type === "service");

  const stats = useMemo(() => {
    const m = new Map<string, number>();
    projects.forEach((j) => { const b = jobBadge(j); m.set(b, (m.get(b) ?? 0) + 1); });
    return [...m.entries()];
  }, [projects]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    return all.filter((j) =>
      [j.title, customerName(j.customers), address(j), j.report_number].join(" ").toLowerCase().includes(s),
    );
  }, [q, all]);

  const shownProjects = filter && filter !== "Regie" ? projects.filter((j) => jobBadge(j) === filter) : projects;
  const showProjects = filter !== "Regie";
  const showServices = !filter || filter === "Regie";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight">{greeting()} Timo</h1>
        <p className="mt-1 text-sm text-muted-foreground tabular">
          {projects.length} aktive Projekte · {services.length} offene Regieaufträge
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
        <Kpi icon={HardHat} label="Aktive Projekte" value={projects.length} hint="in Bearbeitung" />
        <Kpi icon={FileText} label="Offerten" value={projects.filter((j) => jobBadge(j) === "Offerte").length} hint="warten auf Entscheid" />
        <Kpi icon={Hammer} label="In Ausführung" value={projects.filter((j) => jobBadge(j) === "Ausführung").length} hint="laufende Baustellen" />
        <Kpi icon={ClipboardList} label="Regieaufträge" value={services.length} hint="offen" />
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:max-w-md">
        <Link to="/baustellen/neu" search={{ typ: "project" }}
          className="flex h-14 items-center gap-3 rounded-xl bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-opacity active:opacity-85"
          style={{ boxShadow: "var(--shadow-primary)" }}>
          <FolderPlus className="h-5 w-5 shrink-0" strokeWidth={1.75} /> Neues Projekt
        </Link>
        <Link to="/baustellen/neu" search={{ typ: "service" }}
          className="flex h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 text-[15px] font-medium text-foreground transition-colors active:bg-muted"
          style={{ boxShadow: "var(--shadow-card)" }}>
          <Wrench className="h-5 w-5 shrink-0 text-warning" strokeWidth={1.75} /> Regieauftrag
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Auftrag, Kunde oder Rapportnummer suchen"
          className="h-11 rounded-xl border-border bg-muted/70 pl-10 text-[15px] shadow-none focus-visible:bg-card" />
        {q && (
          <button onClick={() => setQ("")} aria-label="Suche leeren" className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {results ? (
        <section className="space-y-2">
          <h2 className="section-title px-1">Suchergebnisse · {results.length}</h2>
          {results.length ? (
            <div className="list-group">{results.map((j) => <JobCard key={j.id} job={j} />)}</div>
          ) : <Empty text="Keine Treffer in den aktiven Aufträgen." />}
        </section>
      ) : (
        <>
          {(stats.length > 0 || services.length > 0) && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              <Chip active={!filter} onClick={() => setFilter(null)} label="Alle" count={all.length} />
              {stats.map(([s, n]) => (
                <Chip key={s} active={filter === s} onClick={() => setFilter(filter === s ? null : s)} label={s} count={n} />
              ))}
              {services.length > 0 && (
                <Chip active={filter === "Regie"} onClick={() => setFilter(filter === "Regie" ? null : "Regie")} label="Regie" count={services.length} />
              )}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          {showProjects && (
            <section className="space-y-2">
              <h2 className="section-title px-1">Projekte</h2>
              {jobs.isLoading ? <Empty text="Laden…" /> : shownProjects.length ? (
                <div className="list-group">{shownProjects.slice(0, 8).map((j) => <JobCard key={j.id} job={j} />)}</div>
              ) : <Empty text="Keine aktiven Projekte." />}
            </section>
          )}
          {showServices && (
            <section className="space-y-2">
              <h2 className="section-title px-1">Regie- / Serviceaufträge</h2>
              {services.length ? (
                <div className="list-group">{services.slice(0, 8).map((j) => <JobCard key={j.id} job={j} />)}</div>
              ) : !jobs.isLoading && <Empty text="Keine offenen Serviceaufträge." />}
            </section>
          )}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof HardHat; label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {label}<Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular tracking-tight">{value}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Chip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground active:bg-muted"}`}>
      {label}
      <span className={`tabular text-xs ${active ? "opacity-70" : "text-muted-foreground"}`}>{count}</span>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{text}</p>;
}
