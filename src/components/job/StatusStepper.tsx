import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { normalizeStatus, stepsFor } from "@/lib/app";

/** Clickable workflow stepper shown in the job header. Tap any step to jump there. */
export function StatusStepper({ type, status, onChange }: { type: string; status: string; onChange: (s: string) => void }) {
  const steps = stepsFor(type);
  const cur = normalizeStatus(type, status);
  const idx = Math.max(0, steps.indexOf(cur));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-step="${idx}"]`);
    el?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [idx]);

  const next = steps[idx + 1];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>Schritt {idx + 1} von {steps.length}</span>
        <span className="font-semibold text-foreground">{steps[idx]}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${((idx + 1) / steps.length) * 100}%` }} />
      </div>
      <div ref={ref} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {steps.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <button
              key={s}
              data-step={i}
              onClick={() => onChange(s)}
              className={`flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold ${
                active ? "border-primary bg-primary text-primary-foreground" : done ? "border-primary/30 bg-primary/10 text-primary" : "bg-card text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : <span className="font-mono text-xs">{i + 1}</span>}
              {s}
            </button>
          );
        })}
      </div>
      {next && (
        <button onClick={() => onChange(next)} className="h-11 w-full rounded-lg border border-primary text-sm font-semibold text-primary active:bg-primary/10">
          Weiter zu «{next}» →
        </button>
      )}
    </div>
  );
}
