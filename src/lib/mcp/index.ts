import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listJobs from "./tools/list-jobs";
import listCustomers from "./tools/list-customers";
import addNote from "./tools/add-note";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "arbeitstool-haustechnik-nws",
  title: "Arbeitstool-Haustechnik NWS",
  version: "0.1.0",
  instructions:
    "Tools for the Haustechnik Nordwestschweiz job app (German, CHF). Use list_jobs and list_customers to look up data; update_job_notes appends notes to a job.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listJobs, listCustomers, addNote],
});
