import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  buildExperience,
  correctionsFromSuggestions,
  type ExperienceJob,
  type ExperienceLabour,
  type ExperienceMaterial,
  type SuggestionDecision,
} from "@/lib/company-experience";

type Cat = { name: string } | { name: string }[] | null;

function categoryName(value: Cat) {
  if (!value) return null;
  return Array.isArray(value) ? value[0]?.name ?? null : value.name;
}

export async function loadCompanyExperience(excludeJobId?: string) {
  const [jobs, labour, times, materials, serviceLabour, suggestions] = await Promise.all([
    supabase.from("jobs").select("id, job_type, lifecycle_status, status"),
    supabase.from("labour_items").select("id, job_id, description, hours, source, item_type, parent_id"),
    supabase.from("labour_time_entries").select("labour_item_id, hours"),
    supabase.from("material_requirements").select("job_id, quantity, actual_quantity, product_id, material_categories(name)"),
    supabase.from("service_labour_entries").select("job_id, description, hours"),
    supabase.from("ai_suggestions").select("kind, state, payload").neq("state", "pending"),
  ]);
  const error = jobs.error || labour.error || times.error || materials.error || serviceLabour.error || suggestions.error;
  if (error) throw error;

  const built = buildExperience({
    ...(excludeJobId ? { excludeJobId } : {}),
    jobs: (jobs.data ?? []).map((job): ExperienceJob => ({
      id: job.id,
      jobType: job.job_type,
      lifecycleStatus: job.lifecycle_status,
      status: job.status,
    })),
    labour: (labour.data ?? []).map((row): ExperienceLabour => ({
      id: row.id,
      jobId: row.job_id,
      description: row.description,
      hours: Number(row.hours),
      source: row.source,
      itemType: row.item_type,
      parentId: row.parent_id,
    })),
    times: (times.data ?? []).map((row) => ({ labourItemId: row.labour_item_id, hours: Number(row.hours) })),
    materials: (materials.data ?? []).map((row): ExperienceMaterial => ({
      jobId: row.job_id,
      category: categoryName(row.material_categories as Cat),
      quantity: Number(row.quantity),
      actualQuantity: row.actual_quantity == null ? null : Number(row.actual_quantity),
      productId: row.product_id,
    })),
    serviceLabour: (serviceLabour.data ?? []).map((row) => ({
      jobId: row.job_id,
      description: row.description,
      hours: Number(row.hours),
    })),
  });

  return {
    ...built,
    corrections: correctionsFromSuggestions(suggestions.data ?? []),
  };
}

export const companyExperienceQuery = (excludeJobId?: string) =>
  queryOptions({
    queryKey: ["company-experience", excludeJobId ?? "all"],
    queryFn: () => loadCompanyExperience(excludeJobId),
    staleTime: 30_000,
  });

export async function recordSuggestionDecision(
  id: string,
  payload: Record<string, unknown>,
  decision: SuggestionDecision,
  accepted: number | null,
  fromHistory: boolean,
) {
  const next = { ...payload, entscheid: decision, uebernommen: accepted, firma: fromHistory };
  const { error } = await supabase.from("ai_suggestions").update({
    state: decision === "discard" ? "discarded" : "accepted",
    payload: next as Json,
  }).eq("id", id);
  if (error) throw error;
}
