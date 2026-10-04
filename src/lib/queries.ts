import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { JobWithCustomer } from "@/components/JobCard";

export const jobsQuery = () =>
  queryOptions({
    queryKey: ["jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*, customers(company_name, first_name, last_name)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as JobWithCustomer[];
    },
  });

export const customersQuery = () =>
  queryOptions({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("company_name").order("last_name");
      if (error) throw error;
      return data;
    },
  });

export const categoriesQuery = () =>
  queryOptions({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("material_categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

export const settingsQuery = () =>
  queryOptions({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
