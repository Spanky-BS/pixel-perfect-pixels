import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { JobCard } from "@/components/JobCard";
import { customersQuery, jobsQuery } from "@/lib/queries";
import { address, customerName } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/uebersicht")({
  head: () => ({
    meta: [
      { title: "Übersicht – Haustechnik Nordwestschweiz" },
      { name: "description", content: "Aktive und zuletzt bearbeitete Baustellen auf einen Blick." },
      { property: "og:title", content: "Übersicht – Haustechnik Nordwestschweiz" },
      { property: "og:description", content: "Aktive und zuletzt bearbeitete Baustellen auf einen Blick." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const jobs = useQuery(jobsQuery());
  const customers = useQuery(customersQuery());
  const [q, setQ] = useState("");

  const all = jobs.data ?? [];
  const active = all.filter((j) => j.status !== "Abgeschlossen");
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
      <Link to="/baustellen/neu" className="flex h-16 items-center justify-center gap-2 rounded-xl bg-primary text-lg font-semibold text-primary-foreground shadow-sm active:opacity-90">
        <Plus className="h-6 w-6" /> Neue Baustelle
      </Link>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Baustelle oder Kunde suchen" className="h-12 bg-card pl-10 text-base" />
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
            <Stat label="Aktiv" value={active.length} />
            <Stat label="Total" value={all.length} />
            <Stat label="Kunden" value={customers.data?.length ?? 0} />
          </div>
          <section className="space-y-3">
            <h2 className="section-title">Aktive Baustellen</h2>
            {jobs.isLoading && <p className="text-sm text-muted-foreground">Laden…</p>}
            {!jobs.isLoading && !active.length && (
              <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Noch keine aktiven Baustellen.</p>
            )}
            {active.slice(0, 6).map((j) => <JobCard key={j.id} job={j} />)}
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
