/** Current commercial parameters live in settings. Never substitute a fixed rate. */

export const MISSING_RATE = "Stundensatz fehlt in den Einstellungen.";

export function settingNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function hourlyRateFromSettings(
  settings: { default_hourly_rate?: number | null; service_hourly_rate?: number | null } | null | undefined,
  kind: "project" | "service" = "project",
): number | null {
  if (!settings) return null;
  if (kind === "service") return settingNumber(settings.service_hourly_rate) ?? settingNumber(settings.default_hourly_rate);
  return settingNumber(settings.default_hourly_rate);
}
