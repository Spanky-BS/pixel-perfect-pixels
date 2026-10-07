import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  LABOUR_ITEM_SECTION,
  LABOUR_ITEM_TASK,
  STANDARD_WORK_POSITIONS,
  formatCHF,
  type Labour,
} from "@/lib/app";
import { groupLabourForQuote } from "@/lib/ai.functions";
import {
  childTasks,
  findSectionByTitle,
  nextHours,
  planGroupingPersist,
  sameSectionTitle,
  sanitizeGroupingProposal,
  ungroupedTasks,
  type GroupDraft,
} from "@/lib/labour-grouping";
import { labourQuoteAmount, quotedLabour } from "@/lib/project-quote";
import { hourlyRateFromSettings, MISSING_RATE } from "@/lib/commercial";

export function OfferteLabour({
  jobId,
  locked,
  labour,
  hourlyRate,
  onEditLabour,
  onTouchOfferte,
}: {
  jobId: string;
  locked: boolean;
  labour: Labour[] | undefined;
  hourlyRate: number | null;
  onEditLabour: (d: Partial<Labour> & { job_id: string }) => void;
  onTouchOfferte: () => void;
}) {
  const qc = useQueryClient();
  const runGroup = useServerFn(groupLabourForQuote);
  const list = labour ?? [];
  const quoted = quotedLabour(list);
  const ungrouped = ungroupedTasks(list);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<GroupDraft[] | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["labour", jobId] });

  async function bumpSectionHours(sectionId: string | null, delta: number) {
    if (!sectionId || !delta) return;
    const { data: section, error } = await supabase.from("labour_items").select("hours").eq("id", sectionId).maybeSingle();
    if (error) throw error;
    if (!section) return;
    const { error: updateError } = await supabase.from("labour_items").update({ hours: nextHours(Number(section.hours), delta) }).eq("id", sectionId);
    if (updateError) throw updateError;
  }

  async function moveTask(task: Labour, raw: string) {
    if (locked) return;
    let target = raw;
    if (raw === "__new__") {
      const name = window.prompt("Name der Offertposition");
      if (!name?.trim()) return;
      const existing = findSectionByTitle(quoted, name.trim());
      const created = existing?.id ?? await insertSection(name.trim(), "", 0);
      if (!created) return;
      target = created;
    }
    const toId = target || null;
    const fromId = task.parent_id;
    if (fromId === toId) return;
    const { error } = await supabase.from("labour_items").update({ parent_id: toId }).eq("id", task.id);
    if (error) return toast.error(error.message);
    try {
      await bumpSectionHours(fromId, -Number(task.hours));
      await bumpSectionHours(toId, Number(task.hours));
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "Stunden nicht aktualisiert");
    }
    refresh();
    onTouchOfferte();
  }

  async function insertSection(title: string, notes: string, hours: number) {
    if (hourlyRate == null) {
      toast.error(MISSING_RATE);
      return null;
    }
    const { data, error } = await supabase.from("labour_items").insert({
      job_id: jobId,
      description: title,
      hours,
      hourly_rate: hourlyRate,
      notes: notes || "",
      source: "manual",
      item_type: LABOUR_ITEM_SECTION,
      parent_id: null,
      sort_order: Date.now() % 1e9,
    }).select("id").single();
    if (error || !data) {
      toast.error(error?.message ?? "Position speichern fehlgeschlagen");
      return null;
    }
    return data.id;
  }

  async function promoteTask(task: Labour) {
    if (!confirm("Diese Aufgabe als Offertposition verwenden?")) return;
    const { error } = await supabase.from("labour_items").update({
      item_type: LABOUR_ITEM_SECTION,
      parent_id: null,
    }).eq("id", task.id);
    if (error) return toast.error(error.message);
    refresh();
    onTouchOfferte();
  }

  async function addMissingStandards() {
    if (hourlyRate == null) return toast.error(MISSING_RATE);
    const missing = STANDARD_WORK_POSITIONS.filter((t) => !quoted.some((l) => sameSectionTitle(l.description, t)));
    if (!missing.length) return toast.message("Standardpositionen sind bereits vorhanden");
    const { error } = await supabase.from("labour_items").insert(
      missing.map((title, i) => ({
        job_id: jobId,
        description: title,
        hours: 0,
        hourly_rate: hourlyRate,
        notes: "",
        source: "manual",
        item_type: LABOUR_ITEM_SECTION,
        parent_id: null,
        sort_order: Date.now() % 1e9 + i,
      })),
    );
    if (error) return toast.error(error.message);
    refresh();
    onTouchOfferte();
  }

  async function removeSection(l: Labour) {
    const kids = childTasks(list, l.id);
    const msg = kids.length
      ? "Position entfernen? Die Aufgaben bleiben erhalten und sind wieder nicht zugeordnet."
      : "Position aus der Offerte entfernen?";
    if (!confirm(msg)) return;
    const { error } = await supabase.from("labour_items").delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function removeTask(task: Labour) {
    if (!confirm("Aufgabe entfernen?")) return;
    try {
      await bumpSectionHours(task.parent_id, -Number(task.hours));
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "Stunden nicht aktualisiert");
    }
    const { error } = await supabase.from("labour_items").delete().eq("id", task.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function proposeGroups() {
    setBusy(true);
    try {
      const r = await runGroup({ data: { jobId } });
      const next = sanitizeGroupingProposal(r.sections, ungrouped);
      if (!next.length) return toast.message("Keine Zuordnung gefunden");
      setDrafts(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gliedern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function confirmGroups() {
    if (!drafts?.length) return;
    setBusy(true);
    try {
      const plan = planGroupingPersist(drafts, list);
      for (const row of plan.createSections) {
        const id = await insertSection(row.title, row.notes, row.hours);
        if (!id) throw new Error("Abschnitt speichern fehlgeschlagen");
        const { error } = await supabase.from("labour_items").update({ parent_id: id }).in("id", row.taskIds);
        if (error) throw error;
      }
      for (const row of plan.updateSections) {
        const { error: uErr } = await supabase.from("labour_items").update({ hours: row.hours, notes: row.notes ?? "" }).eq("id", row.id);
        if (uErr) throw uErr;
        const { error: tErr } = await supabase.from("labour_items").update({ parent_id: row.id }).in("id", row.taskIds);
        if (tErr) throw tErr;
      }
      setDrafts(null);
      refresh();
      onTouchOfferte();
      toast.success("Abschnitte übernommen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  function moveDraftTask(taskId: string, title: string) {
    setDrafts((prev) => {
      if (!prev) return prev;
      const without = prev.map((d) => ({ ...d, taskIds: d.taskIds.filter((id) => id !== taskId) }));
      const target = without.find((d) => d.title === title);
      if (target) {
        return without
          .map((d) => (d.title === title ? { ...d, taskIds: [...d.taskIds, taskId] } : d))
          .filter((d) => d.taskIds.length);
      }
      return [...without.filter((d) => d.taskIds.length), { title, notes: "", taskIds: [taskId] }];
    });
  }

  return (
    <section className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug">Arbeiten</h3>
        {!locked && (
          <button
            type="button"
            className="inline-flex h-10 shrink-0 items-center text-sm font-medium text-primary"
            onClick={() => {
              if (hourlyRate == null) return toast.error(MISSING_RATE);
              onEditLabour({ job_id: jobId, hours: 1, hourly_rate: hourlyRate, item_type: LABOUR_ITEM_SECTION, parent_id: null });
            }}
          >
            + Position
          </button>
        )}
      </div>

      {!locked && ungrouped.length > 0 && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-card p-3">
          <p className="text-sm font-medium">{ungrouped.length} Aufgabe{ungrouped.length === 1 ? "" : "n"} noch nicht zugeordnet</p>
          <Button className="h-12 w-full font-semibold" disabled={busy} onClick={() => void proposeGroups()}>
            <Sparkles className="h-4 w-4" /> {busy ? "Wird gegliedert…" : "In Abschnitte gliedern"}
          </Button>
          {ungrouped.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              sections={quoted}
              locked={locked}
              onMove={moveTask}
              onPromote={() => void promoteTask(t)}
              onRemove={() => void removeTask(t)}
            />
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border/80 bg-card">
        {!quoted.length && !ungrouped.length && <p className="px-3 py-4 text-sm text-muted-foreground">Noch keine Arbeitspositionen.</p>}
        {quoted.map((l) => {
          const kids = childTasks(list, l.id);
          return (
            <div key={l.id} className="border-b border-border/70 px-3 py-3 last:border-b-0">
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => !locked && onEditLabour(l)}>
                  <p className="font-semibold">{l.description || "–"}</p>
                  {l.notes?.trim() && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{l.notes}</p>}
                  <p className="mt-1 font-mono text-sm text-muted-foreground">
                    {Number(l.hours) > 0
                      ? `${Number(l.hours).toLocaleString("de-CH")} h × ${formatCHF(Number(l.hourly_rate))}`
                      : "Stunden noch offen"}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="font-mono text-sm font-medium">{formatCHF(labourQuoteAmount(l))}</span>
                  {!locked && (
                    <>
                      <button type="button" aria-label="Bearbeiten" className="flex h-10 w-10 items-center justify-center text-muted-foreground" onClick={() => onEditLabour(l)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" aria-label="Entfernen" className="flex h-10 w-10 items-center justify-center text-destructive" onClick={() => void removeSection(l)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {kids.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {kids.map((t) => (
                    <li key={t.id}>
                      <TaskRow
                        task={t}
                        sections={quoted}
                        locked={locked}
                        onMove={moveTask}
                        onRemove={() => void removeTask(t)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {!locked && (
        <button type="button" className="text-sm font-medium text-primary" onClick={() => void addMissingStandards()}>
          Standardpositionen ergänzen
        </button>
      )}

      <Sheet open={!!drafts} onOpenChange={(o) => !o && setDrafts(null)}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader><SheetTitle>Abschnitte prüfen</SheetTitle></SheetHeader>
          {drafts && (
            <div className="space-y-3 p-4 pt-0">
              <p className="text-sm text-muted-foreground">Entwurf – noch nicht gespeichert. Falsch zugeordnete Aufgaben hier umteilen.</p>
              {drafts.map((d, i) => (
                <article key={`${d.title}-${i}`} className="rounded-lg border p-3">
                  <p className="font-semibold">{d.title}</p>
                  <Textarea
                    className="mt-2 min-h-20 text-base"
                    value={d.notes}
                    onChange={(e) => setDrafts(drafts.map((x, j) => j === i ? { ...x, notes: e.target.value } : x))}
                  />
                  <ul className="mt-2 space-y-2">
                    {d.taskIds.map((id) => {
                      const task = list.find((l) => l.id === id);
                      if (!task) return null;
                      return (
                        <li key={id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 flex-1">{task.description} · {Number(task.hours).toLocaleString("de-CH")} h</span>
                          <select
                            className="h-11 max-w-[10rem] rounded-md border border-input bg-background px-2 text-sm"
                            value={d.title}
                            onChange={(e) => moveDraftTask(id, e.target.value)}
                          >
                            {drafts.map((x) => <option key={x.title} value={x.title}>{x.title}</option>)}
                          </select>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
              <Button className="h-12 w-full font-semibold" disabled={busy} onClick={() => void confirmGroups()}>
                Übernehmen
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function TaskRow({
  task,
  sections,
  locked,
  onMove,
  onPromote,
  onRemove,
}: {
  task: Labour;
  sections: Labour[];
  locked: boolean;
  onMove: (task: Labour, value: string) => void;
  onPromote?: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md bg-muted/60 px-2 py-2">
      <p className="text-sm">{task.description || "–"} · {Number(task.hours).toLocaleString("de-CH")} h</p>
      {!locked && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span className="shrink-0 text-muted-foreground">Gruppe</span>
            <select
              className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              value={task.parent_id ?? ""}
              onChange={(e) => onMove(task, e.target.value)}
            >
              <option value="">Nicht zugeordnet</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.description || "–"}</option>
              ))}
              <option value="__new__">Neue Gruppe…</option>
            </select>
          </label>
          {onPromote && task.item_type === LABOUR_ITEM_TASK && (
            <button type="button" className="h-11 text-sm font-medium text-primary" onClick={onPromote}>
              Als Offertposition
            </button>
          )}
          <button type="button" aria-label="Aufgabe entfernen" className="flex h-11 w-11 items-center justify-center text-destructive" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
