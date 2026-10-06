import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { normalizeStatus, stepLabel, stepsFor } from "@/lib/app";

/**
 * Workflow stepper. Clicking a step only changes the view (`onSelect`).
 * Persisted job status is never changed here — only explicit business actions do that.
 */
export function StatusStepper({
  type,
  status,
  selected,
  onSelect,
}: {
  type: string;
  status: string;
  selected?: string;
  onSelect: (s: string) => void;
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

  return (
    <div className="space-y-3 border-t border-border/60 pt-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Schritt {viewIdx + 1} von {steps.length}</span>
        <span className="font-medium text-foreground">{stepLabel(type, steps[viewIdx] ?? view)}</span>
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
            ? "bg-primary text-primary-foreground"
            : viewing
              ? "bg-card text-primary ring-1 ring-primary"
              : done
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground";
          return (
            <button
              key={s}
              type="button"
              data-step={i}
              onClick={() => onSelect(s)}
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors ${activeStyle}`}
            >
              {done && !viewing ? <Check className="h-4 w-4" /> : <span className="text-xs opacity-70">{i + 1}</span>}
              {stepLabel(type, s)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
