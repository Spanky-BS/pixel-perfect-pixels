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
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur pt-safe">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <Link to="/uebersicht">
            <Brand />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-32 pt-4">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-safe">
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="flex h-16 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium text-muted-foreground"
              activeProps={{ className: "text-primary" }}
            >
              <t.icon className="h-6 w-6" strokeWidth={2} />
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
