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
    <nav aria-label="Projektphasen" className="surface p-1">
      <div ref={ref} className="flex overflow-x-auto [scrollbar-width:none]">
        {steps.map((s, i) => {
          const done = i < persistedIdx;
          const current = i === persistedIdx;
          const viewing = i === viewIdx;
          return (
            <button
              key={s}
              type="button"
              data-step={i}
              aria-current={viewing ? "step" : undefined}
              onClick={() => onSelect(s)}
              className={`flex h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${viewing ? "bg-primary/[0.08] text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular ${
                  done ? "bg-primary text-primary-foreground" : current ? "bg-primary text-primary-foreground ring-4 ring-primary/15" : "border border-border text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              {stepLabel(type, s)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
