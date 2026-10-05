/** Repeat query keys as observed on the Richner shop: ?ids=a&ids=b */
export function repeatQueryParams(name: string, values: string[]) {
  return values
    .filter(Boolean)
    .map((v) => `${encodeURIComponent(name)}=${encodeURIComponent(v)}`)
    .join("&");
}
