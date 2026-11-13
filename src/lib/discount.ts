export function discountPercent(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

export function discountedAmount(amount: number, discount: number | null | undefined): number {
  return amount * (1 - discountPercent(discount) / 100);
}
