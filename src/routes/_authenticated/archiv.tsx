import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { JobCard } from "@/components/JobCard";
import { PageHeader } from "@/components/Brand";
import { Input } from "@/components/ui/input";
import { jobsQuery } from "@/lib/queries";
import { address, customerName } from "@/lib/app";
import { archiveDate, isActiveJob } from "@/lib/lifecycle";

export const Route = createFileRoute("/_authenticated/archiv")({
  head: () => ({
    meta: [
      { title: "Archiv – Haustechnik Nordwestschweiz" },
      { name: "description", content: "Abgeschlossene und abgesagte Projekte und Regieaufträge." },
      { property: "og:title", content: "Archiv – Haustechnik Nordwestschweiz" },
      { property: "og:description", content: "Abgeschlossene und abgesagte Projekte und Regieaufträge." },
    ],
  }),
  component: ArchivePage,
});

type Filter = "all" | "project" | "service";

function ArchivePage() {
  const { data, isLoading } = useQuery(jobsQuery());
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const archived = useMemo(() => (data ?? []).filter((j) => !isActiveJob(j)), [data]);
  const list = archived.filter((j) => {
    if (filter === "project" && j.job_type === "service") return false;
    if (filter === "service" && j.job_type !== "service") return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [j.title, customerName(j.customers), address(j), j.report_number].join(" ").toLowerCase().includes(s);
  }).sort((a, b) => archiveDate(b).localeCompare(archiveDate(a)));

  return (
    <div>
      <PageHeader title="Archiv" />
      <p className="mb-4 text-sm text-muted-foreground">Abgeschlossene und abgesagte Aufträge.</p>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kunde, Titel, Adresse oder Rapportnummer" className="h-12 bg-card pl-10 text-base" />
      </div>
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {([
          ["all", "Alle"],
          ["project", "Projekte"],
          ["service", "Regie / Service"],
        ] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`h-10 rounded-lg px-2 text-sm font-medium ${filter === k ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Laden…</p>}
        {list.map((j) => <JobCard key={j.id} job={j} />)}
        {!isLoading && !list.length && (
          <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Noch keine archivierten Aufträge.</p>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        <Link to="/baustellen" className="font-semibold text-primary">Aktive Aufträge</Link>
      </p>
    </div>
  );
}
