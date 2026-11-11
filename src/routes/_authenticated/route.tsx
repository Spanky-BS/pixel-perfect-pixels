import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { Home, HardHat, Users, Settings, Archive, LogOut } from "lucide-react";
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
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Link to="/uebersicht"><Brand /></Link>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {tabs.map((t) => (
            <Link key={t.to} to={t.to}
              className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              activeProps={{ className: "bg-primary/8 !text-primary" }}>
              <t.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = "/auth"; }}
            className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} /> Abmelden
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/95 backdrop-blur-md pt-safe lg:hidden">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <Link to="/uebersicht"><Brand /></Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-32 pt-6 lg:ml-60 lg:max-w-none lg:px-10 lg:pb-12 lg:pt-8">
        <div className="lg:mx-auto lg:max-w-6xl"><Outlet /></div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-2xl rounded-2xl border border-border bg-card/85 backdrop-blur-xl pb-safe lg:hidden" style={{ boxShadow: "var(--shadow-float)" }}>
        <div className="grid grid-cols-5 p-1">
          {tabs.map((t) => (
            <Link key={t.to} to={t.to}
              className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium text-muted-foreground transition-colors"
              activeProps={{ className: "text-primary [&>svg]:stroke-[2.4]" }}>
              <t.icon className="h-[22px] w-[22px]" strokeWidth={1.75} />
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
