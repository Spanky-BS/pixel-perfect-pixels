import { statusTone } from "@/lib/app";

// Placeholder wordmark until the real company logo is supplied.
export function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex shrink-0 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground ${
          large ? "h-16 w-16 text-2xl" : "h-9 w-9 text-sm"
        }`}
      >
        HN
      </div>
      <div className="leading-tight">
        <div className={`font-bold tracking-tight text-primary ${large ? "text-2xl" : "text-base"}`}>Haustechnik</div>
        <div className={`font-medium text-muted-foreground ${large ? "text-base" : "text-xs"}`}>Nordwestschweiz</div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-semibold ${statusTone[status] ?? "bg-muted"}`}>
      {status}
    </span>
  );
}

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {action}
    </div>
  );
}
