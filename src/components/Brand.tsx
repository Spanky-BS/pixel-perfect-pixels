import { statusTone } from "@/lib/app";
import logo from "@/assets/logo.jpeg.asset.json";

export function Brand({ large = false }: { large?: boolean }) {
  return (
    <img
      src={logo.url}
      alt="Haustechnik Nordwestschweiz"
      className={`w-auto mix-blend-multiply ${large ? "h-16" : "h-9"}`}
    />
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${statusTone[status] ?? "bg-muted"}`}>
      {status}
    </span>
  );
}

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {action}
    </div>
  );
}
