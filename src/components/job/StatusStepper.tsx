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
      <div className="flex gap-1">
        {steps.map((s, i) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= persistedIdx ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>
      <div ref={ref} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {steps.map((s, i) => {
          const done = i < persistedIdx;
          const viewing = i === viewIdx;
          const current = i === persistedIdx;
          const activeStyle = current && viewing
            ? "bg-primary text-primary-foreground shadow-[var(--shadow-primary)]"
            : viewing
              ? "bg-card text-primary ring-2 ring-primary"
              : done
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground";
          return (
            <button
              key={s}
              type="button"
              data-step={i}
              onClick={() => onSelect(s)}
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-transform active:scale-95 ${activeStyle}`}
            >
              {done && !viewing ? <Check className="h-4 w-4" /> : <span className="text-xs opacity-70">{i + 1}</span>}
              {stepLabel(type, s)}
            </button>
          );
        })}
      </div>
      {canAdvance && next && (
        <button
          type="button"
          onClick={() => onAdvance(next)}
          className="action-tile-primary min-h-0 h-12 w-full flex-row text-base"
        >
          Weiter zu «{stepLabel(type, next)}» →
        </button>
      )}
    </div>
  );
}
