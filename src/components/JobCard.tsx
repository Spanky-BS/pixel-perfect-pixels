import { Link } from "@tanstack/react-router";
import { MapPin, ChevronRight } from "lucide-react";
import { address, customerName, displayServiceStatus, normalizeStatus, stepsFor, type Customer, type Job } from "@/lib/app";
import { StatusBadge } from "./Brand";
import { lifecycleLabel, lifecycleOf } from "@/lib/lifecycle";

export type JobWithCustomer = Job & { customers: Pick<Customer, "company_name" | "first_name" | "last_name"> | null };

export function jobBadge(job: JobWithCustomer) {
  const life = lifecycleOf(job);
  return job.job_type === "service"
    ? displayServiceStatus(job.status)
    : life === "active" ? normalizeStatus(job.job_type, job.status) : lifecycleLabel(life);
}

function relTime(iso?: string | null) {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (d < 1) return "Heute";
  if (d < 2) return "Gestern";
  if (d < 7) return `vor ${Math.floor(d)} Tagen`;
  return new Date(iso).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" });
}

/** Compact list row; place inside a `.list-group` container. */
export function JobCard({ job }: { job: JobWithCustomer }) {
  const addr = address(job);
  const badge = jobBadge(job);
  const steps = stepsFor(job.job_type);
  const idx = steps.indexOf(badge);
  const isService = job.job_type === "service";
  return (
    <Link
      to="/baustellen/$id"
      params={{ id: job.id }}
      className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-muted/60"
    >
      <div className={`w-1 self-stretch rounded-full ${isService ? "bg-warning" : "bg-primary"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="truncate text-[15px] font-semibold leading-tight">{job.title}</div>
          <div className="shrink-0 text-xs text-muted-foreground tabular">{relTime((job as { updated_at?: string }).updated_at)}</div>
        </div>
        <div className="mt-0.5 truncate text-sm text-muted-foreground">
          {customerName(job.customers)}
          {isService && job.report_number && <span className="text-primary"> · {job.report_number}</span>}
        </div>
        {addr && (
          <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{addr}</span>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge status={badge} />
          {idx >= 0 && (
            <div className="flex gap-0.5" aria-hidden>
              {steps.map((s, i) => (
                <span key={s} className={`h-1 w-3 rounded-full ${i <= idx ? (isService ? "bg-warning" : "bg-primary") : "bg-border"}`} />
              ))}
            </div>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
    </Link>
  );
}
