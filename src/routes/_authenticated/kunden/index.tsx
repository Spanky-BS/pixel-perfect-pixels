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
      <div className="divide-y rounded-xl border bg-card">
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Laden…</p>}
        {list.map((c) => (
          <Link key={c.id} to="/kunden/$id" params={{ id: c.id }} className="flex min-h-16 items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{customerName(c)}</div>
              <div className="truncate text-sm text-muted-foreground">{address(c) || c.phone}</div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        ))}
        {!isLoading && !list.length && <p className="p-6 text-center text-sm text-muted-foreground">Keine Kunden.</p>}
      </div>
    </div>
  );
}
