import { Link } from "@tanstack/react-router";
import { MapPin, ChevronRight } from "lucide-react";
import { JOB_TYPE_LABEL, address, customerName, displayServiceStatus, formatDate, normalizeStatus, type Customer, type Job } from "@/lib/app";
import { StatusBadge } from "./Brand";
import { archiveDate, lifecycleLabel, lifecycleOf } from "@/lib/lifecycle";

export type JobWithCustomer = Job & { customers: Pick<Customer, "company_name" | "first_name" | "last_name"> | null };

export function JobCard({ job }: { job: JobWithCustomer }) {
  const addr = address(job);
  const life = lifecycleOf(job);
  const badge = job.job_type === "service"
    ? displayServiceStatus(job.status)
    : life === "active" ? normalizeStatus(job.job_type, job.status) : lifecycleLabel(life);
  const when = life === "active" ? `Bearbeitet ${formatDate(job.updated_at, true)}` : `${lifecycleLabel(life)} ${formatDate(archiveDate(job), true)}`;
  return (
    <Link
      to="/baustellen/$id"
      params={{ id: job.id }}
      className="surface flex items-center gap-3 p-4 transition-transform active:scale-[0.98]"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {customerName(job.customers)}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${job.job_type === "service" ? "bg-warning/20 text-foreground" : "bg-primary/10 text-primary"}`}>{job.job_type === "service" ? "Regie" : JOB_TYPE_LABEL.project}</span>
            <StatusBadge status={badge} />
          </span>
        </div>
        <div className="truncate text-base font-semibold">{job.title}</div>
        {addr && (
          <div className="mt-1 flex items-center gap-1 truncate text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{addr}</span>
          </div>
        )}
        <div className="mt-1 text-xs text-muted-foreground">{when}</div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
