import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { normalizeStatus, stepLabel, stepsFor } from "@/lib/app";

/**
 * Workflow stepper. Clicking a step only changes view (`onSelect`).
 * Persisted job status is advanced only via `onAdvance` (e.g. «Weiter zu …»).
 */
export function StatusStepper({
  type,
  status,
  selected,
  onSelect,
  onAdvance,
}: {
  type: string;
  status: string;
  selected?: string;
  onSelect: (s: string) => void;
  onAdvance: (s: string) => void;
}) {
  const steps = stepsFor(type);
  const persisted = normalizeStatus(type, status);
  const view = selected ? normalizeStatus(type, selected) : persisted;
  const persistedIdx = Math.max(0, steps.indexOf(persisted));
  const viewIdx = Math.max(0, steps.indexOf(view));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-step="${viewIdx}"]`);
    el?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [viewIdx]);

  const next = steps[persistedIdx + 1];
  const canAdvance = !!next && next !== "Abgeschlossen";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>Schritt {viewIdx + 1} von {steps.length}</span>
        <span className="font-semibold text-foreground">{stepLabel(type, steps[viewIdx] ?? view)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${((persistedIdx + 1) / steps.length) * 100}%` }} />
      </div>
      <div ref={ref} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {steps.map((s, i) => {
          const done = i < persistedIdx;
          const viewing = i === viewIdx;
          const current = i === persistedIdx;
          const activeStyle = current && viewing
            ? "border-primary bg-primary text-primary-foreground"
            : viewing
              ? "border-primary bg-card text-primary ring-1 ring-primary"
              : done
                ? "border-primary/30 bg-primary/10 text-primary"
                : "bg-card text-muted-foreground";
          return (
            <button
              key={s}
              type="button"
              data-step={i}
              onClick={() => onSelect(s)}
              className={`flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold ${activeStyle}`}
            >
              {done && !viewing ? <Check className="h-4 w-4" /> : <span className="font-mono text-xs">{i + 1}</span>}
              {stepLabel(type, s)}
            </button>
          );
        })}
      </div>
      {canAdvance && next && (
        <button
          type="button"
          onClick={() => onAdvance(next)}
          className="h-11 w-full rounded-lg border border-primary text-sm font-semibold text-primary active:bg-primary/10"
        >
          Weiter zu «{stepLabel(type, next)}» →
        </button>
      )}
    </div>
  );
}
