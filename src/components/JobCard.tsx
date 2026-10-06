import { Link } from "@tanstack/react-router";
import { MapPin, ChevronRight } from "lucide-react";
import { JOB_TYPE_LABEL, address, customerName, displayServiceStatus, normalizeStatus, type Customer, type Job } from "@/lib/app";
import { StatusBadge } from "./Brand";
import { lifecycleLabel, lifecycleOf } from "@/lib/lifecycle";

export type JobWithCustomer = Job & { customers: Pick<Customer, "company_name" | "first_name" | "last_name"> | null };

export function JobCard({ job }: { job: JobWithCustomer }) {
  const addr = address(job);
  const life = lifecycleOf(job);
  const badge = job.job_type === "service"
    ? displayServiceStatus(job.status)
    : life === "active" ? normalizeStatus(job.job_type, job.status) : lifecycleLabel(life);
  return (
    <Link
      to="/baustellen/$id"
      params={{ id: job.id }}
      className="surface flex min-h-[116px] items-center gap-3 p-4 transition-colors active:bg-muted/30"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-muted-foreground">{customerName(job.customers)}</div>
        <div className="mt-0.5 truncate text-base font-semibold">{job.title}</div>
        {job.job_type === "service" && job.report_number && (
          <div className="mt-0.5 truncate text-sm text-primary">{job.report_number}</div>
        )}
        {addr && (
          <div className="mt-1 flex items-center gap-1 truncate text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{addr}</span>
          </div>
        )}
        <div className="mt-2 flex items-center gap-1.5">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${job.job_type === "service" ? "bg-warning/15 text-foreground" : "bg-primary/[0.08] text-primary"}`}>
            {job.job_type === "service" ? "Regie" : JOB_TYPE_LABEL.project}
          </span>
          <StatusBadge status={badge} />
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" />
    </Link>
  );
}
