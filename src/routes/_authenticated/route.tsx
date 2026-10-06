import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { Home, HardHat, Users, Settings, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/Brand";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: Layout,
});

const tabs = [
  { to: "/uebersicht", label: "Übersicht", icon: Home },
  { to: "/baustellen", label: "Aufträge", icon: HardHat },
  { to: "/kunden", label: "Kunden", icon: Users },
  { to: "/archiv", label: "Archiv", icon: Archive },
  { to: "/einstellungen", label: "Einstellungen", icon: Settings },
] as const;

function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/95 backdrop-blur-md pt-safe">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <Link to="/uebersicht">
            <Brand />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-32 pt-6">
        <Outlet />
      </main>
      <nav className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-2xl rounded-2xl border border-border/70 bg-card/95 backdrop-blur-md pb-safe" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="grid grid-cols-5 p-1">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium text-muted-foreground transition-colors"
              activeProps={{ className: "bg-primary/[0.07] text-primary" }}
            >
              <t.icon className="h-[22px] w-[22px]" strokeWidth={2} />
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
