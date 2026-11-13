import type { Labour, Material } from "@/lib/app";
import { discountedAmount } from "@/lib/discount";
import { labourQuoteAmount, linkedProduct } from "@/lib/project-quote";

export { discountedAmount } from "@/lib/discount";
import { unitSalesPrice } from "@/lib/products";
import { rubricOf } from "@/lib/rubrics";

export type OfferTextStyle = "text" | "heading";
export type OfferTextRow = {
  id: string;
  rubric: string;
  text: string;
  style: OfferTextStyle;
  sort_order: number;
};

export type OfferRow =
  | { kind: "arbeit"; id: string; description: string; rubric: string; sort_order: number; amount: number | null; row: Labour }
  | { kind: "material"; id: string; description: string; rubric: string; sort_order: number; amount: number | null; row: Material }
  | { kind: "text"; id: string; description: string; rubric: string; sort_order: number; amount: null; row: OfferTextRow }
  | { kind: "heading"; id: string; description: string; rubric: string; sort_order: number; amount: null; row: OfferTextRow };

/** Accept only the known JSON shape; damaged or old values simply produce no text rows. */
export function parseOfferTextRows(value: unknown): OfferTextRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): OfferTextRow[] => {
    if (!entry || typeof entry !== "object") return [];
    const r = entry as Record<string, unknown>;
    if (typeof r["id"] !== "string" || typeof r["rubric"] !== "string" || typeof r["text"] !== "string") return [];
    if (r["style"] !== "text" && r["style"] !== "heading") return [];
    const order = Number(r["sort_order"]);
    return [{ id: r["id"], rubric: r["rubric"], text: r["text"], style: r["style"], sort_order: Number.isFinite(order) ? order : 0 }];
  });
}

export function offerRows(labour: Labour[], materials: Material[], markup: number, textRowsValue: unknown = []): OfferRow[] {
  const rows: OfferRow[] = [
    ...labour.map((l) => ({
      kind: "arbeit" as const,
      id: l.id,
      description: l.description,
      rubric: rubricOf(l),
      sort_order: l.sort_order,
      amount: labourQuoteAmount(l),
      row: l,
    })),
    ...materials.map((m) => {
      const p = linkedProduct(m as unknown as Parameters<typeof linkedProduct>[0]);
      const vk = p ? unitSalesPrice(p, markup) : null;
      return {
        kind: "material" as const,
        id: m.id,
        description: p?.name || m.description,
        rubric: rubricOf(m),
        sort_order: m.sort_order,
        amount: vk != null ? discountedAmount(vk * Number(m.quantity), m.discount) : null,
        row: m,
      };
    }),
    ...parseOfferTextRows(textRowsValue).map((r) => ({
      kind: r.style,
      id: r.id,
      description: r.text,
      rubric: rubricOf(r),
      sort_order: r.sort_order,
      amount: null,
      row: r,
    })),
  ];
  return rows.sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Move a row before the target row, or to the end of a `rubric:CODE` drop zone.
 * Only the source and destination rubrics are renumbered; every other row stays untouched.
 */
export function moveOfferRow<T extends Pick<OfferRow, "id" | "rubric" | "sort_order">>(
  rows: T[],
  activeId: string,
  overId: string,
): T[] {
  const active = rows.find((r) => r.id === activeId);
  if (!active || activeId === overId) return rows;
  const over = rows.find((r) => r.id === overId);
  const destination = over?.rubric ?? (overId.startsWith("rubric:") ? overId.slice(7) : null);
  if (!destination) return rows;

  const source = active.rubric;
  const without = rows.filter((r) => r.id !== activeId);
  const sourceRows = without.filter((r) => r.rubric === source);
  const destinationRows = source === destination ? sourceRows : without.filter((r) => r.rubric === destination);
  const overIndex = destinationRows.findIndex((r) => r.id === overId);
  const insertAfter = source === destination && over != null && active.sort_order < over.sort_order;
  const insertionIndex = overIndex >= 0 ? overIndex + (insertAfter ? 1 : 0) : destinationRows.length;
  destinationRows.splice(insertionIndex, 0, { ...active, rubric: destination });

  const renumber = (list: T[]) => list.map((r, sort_order) => ({ ...r, sort_order }));
  const nextSource = renumber(source === destination ? [] : sourceRows);
  const nextDestination = renumber(destinationRows);
  const unchanged = rows.filter((r) => r.rubric !== source && r.rubric !== destination);
  return [...unchanged, ...nextSource, ...nextDestination];
}
