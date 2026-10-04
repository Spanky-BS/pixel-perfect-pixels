import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { JobCard } from "@/components/JobCard";
import { PageHeader } from "@/components/Brand";
import { jobsQuery } from "@/lib/queries";
import { JOB_STATUSES } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/baustellen/")({
  head: () => ({
    meta: [
      { title: "Baustellen – Haustechnik Nordwestschweiz" },
      { name: "description", content: "Alle Baustellen nach Status." },
      { property: "og:title", content: "Baustellen – Haustechnik Nordwestschweiz" },
      { property: "og:description", content: "Alle Baustellen nach Status." },
    ],
  }),
  component: JobsPage,
});

function JobsPage() {
  const { data, isLoading } = useQuery(jobsQuery());
  const [filter, setFilter] = useState<string>("Alle");
  const list = (data ?? []).filter((j) => filter === "Alle" || j.status === filter);
  return (
    <div>
      <PageHeader
        title="Baustellen"
        action={
          <Link to="/baustellen/neu" className="flex h-11 items-center gap-1 rounded-lg bg-primary px-4 font-semibold text-primary-foreground">
            <Plus className="h-5 w-5" /> Neu
          </Link>
        }
      />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {["Alle", ...JOB_STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`h-10 shrink-0 rounded-full border px-4 text-sm font-medium ${filter === s ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Laden…</p>}
        {list.map((j) => <JobCard key={j.id} job={j} />)}
        {!isLoading && !list.length && <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Keine Baustellen.</p>}
      </div>
    </div>
  );
}
