import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Haustechnik Nordwestschweiz – Baustellen-App" },
      { name: "description", content: "Mobile Baustellenaufnahme für Haustechnik Nordwestschweiz." },
      { property: "og:title", content: "Haustechnik Nordwestschweiz – Baustellen-App" },
      { property: "og:description", content: "Mobile Baustellenaufnahme für Haustechnik Nordwestschweiz." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/uebersicht" : "/auth" });
  },
});
