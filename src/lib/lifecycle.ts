import { supabase } from "@/integrations/supabase/client";
import { isClosed, type Job } from "@/lib/app";

export type LifecycleStatus = "active" | "completed" | "cancelled";

export function lifecycleOf(job: Pick<Job, "status" | "job_type"> & { lifecycle_status?: string | null }): LifecycleStatus {
  if (job.lifecycle_status === "cancelled" || job.status === "Abgesagt") return "cancelled";
  if (job.job_type === "service") {
    return isClosed(job.job_type, job.status) ? "completed" : "active";
  }
  if (job.lifecycle_status === "completed") return "completed";
  if (isClosed(job.job_type, job.status)) return "completed";
  return "active";
}

export function isActiveJob(job: Pick<Job, "status" | "job_type"> & { lifecycle_status?: string | null }) {
  return lifecycleOf(job) === "active";
}

export function lifecycleLabel(status: LifecycleStatus) {
  if (status === "cancelled") return "Abgesagt";
  if (status === "completed") return "Abgeschlossen";
  return "Aktiv";
}

export function archiveDate(job: Pick<Job, "completed_at" | "updated_at"> & { cancelled_at?: string | null }) {
  return job.cancelled_at || job.completed_at || job.updated_at;
}

/** Mark job completed. Does not change workflow step. */
export async function completeJob(jobId: string) {
  const { error } = await supabase.from("jobs").update({
    lifecycle_status: "completed",
    completed_at: new Date().toISOString(),
  }).eq("id", jobId);
  if (error) throw error;
}

/**
 * Cancel / customer rejected quotation.
 * Keeps all job data. Does not advance workflow steps.
 * Future: if a Bexio quotation exists, mark it rejected and store the result on bexio_sync.
 */
export async function cancelJob(jobId: string, reason: string | null) {
  const { error } = await supabase.from("jobs").update({
    lifecycle_status: "cancelled",
    cancelled_at: new Date().toISOString(),
    cancellation_reason: reason,
  }).eq("id", jobId);
  if (error) throw error;
  await supabase.from("quotations").update({ status: "Abgelehnt" }).eq("job_id", jobId);
  // Live Bexio is not called. Later: mark the remote quotation rejected and store the result in bexio_sync.
}
