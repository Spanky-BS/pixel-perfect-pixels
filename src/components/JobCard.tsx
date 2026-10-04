import { Link } from "@tanstack/react-router";
import { MapPin, ChevronRight } from "lucide-react";
import { address, customerName, formatDate, type Customer, type Job } from "@/lib/app";
import { StatusBadge } from "./Brand";

export type JobWithCustomer = Job & { customers: Pick<Customer, "company_name" | "first_name" | "last_name"> | null };

export function JobCard({ job }: { job: JobWithCustomer }) {
  const addr = address(job);
  return (
    <Link
      to="/baustellen/$id"
      params={{ id: job.id }}
      className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-accent"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {customerName(job.customers)}
          </span>
          <StatusBadge status={job.status} />
        </div>
        <div className="truncate text-base font-semibold">{job.title}</div>
        {addr && (
          <div className="mt-1 flex items-center gap-1 truncate text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{addr}</span>
          </div>
        )}
        <div className="mt-1 text-xs text-muted-foreground">Bearbeitet {formatDate(job.updated_at, true)}</div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
