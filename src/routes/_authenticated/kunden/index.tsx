import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/Brand";
import { customersQuery } from "@/lib/queries";
import { address, customerName } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/kunden/")({
  head: () => ({
    meta: [
      { title: "Kunden – Haustechnik Nordwestschweiz" },
      { name: "description", content: "Kundenverzeichnis mit Kontaktdaten und Baustellen." },
      { property: "og:title", content: "Kunden – Haustechnik Nordwestschweiz" },
      { property: "og:description", content: "Kundenverzeichnis mit Kontaktdaten und Baustellen." },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const { data, isLoading } = useQuery(customersQuery());
  const [q, setQ] = useState("");
  const list = (data ?? []).filter((c) => [customerName(c), c.city, c.phone, c.email].join(" ").toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader
        title="Kunden"
        action={
          <Link to="/kunden/$id" params={{ id: "neu" }} className="flex h-11 items-center gap-1 rounded-lg bg-primary px-4 font-semibold text-primary-foreground">
            <Plus className="h-5 w-5" /> Neu
          </Link>
        }
      />
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kunde suchen" className="h-12 bg-card pl-10 text-base" />
      </div>
      <div className="divide-y rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-card)]">
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Laden…</p>}
        {list.map((c) => (
          <Link key={c.id} to="/kunden/$id" params={{ id: c.id }} className="flex min-h-20 items-center gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{customerName(c)}</div>
              {address(c) && <div className="mt-0.5 truncate text-sm text-muted-foreground">{address(c)}</div>}
              {(c.phone || c.email) && <div className="mt-0.5 truncate text-xs text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ")}</div>}
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground/60" />
          </Link>
        ))}
        {!isLoading && !list.length && <p className="p-6 text-center text-sm text-muted-foreground">Keine Kunden.</p>}
      </div>
    </div>
  );
}
