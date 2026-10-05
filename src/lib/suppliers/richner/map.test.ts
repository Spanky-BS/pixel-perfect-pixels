import { describe, expect, it } from "vitest";
import { mapPrice, mapPricePayload, mapProduct, wrapList } from "./map";
import { repeatQueryParams } from "./query";

describe("Richner JSON mapping", () => {
  it("maps a nested product payload", () => {
    const p = mapProduct(
      {
        product: {
          articleNumber: "111",
          name: "WC-Garnitur",
          manufacturer: "Geberit",
          netPrice: 12.5,
          grossPrice: 18,
        },
      },
      "111",
      "richner",
      "https://baubedarf-richner.ch",
    );
    expect(p.productName).toBe("WC-Garnitur");
    expect(p.purchasePrice).toBe(12.5);
    expect(p.grossPrice).toBe(18);
    expect(p.manufacturer).toBe("Geberit");
  });

  it("unwraps price lists", () => {
    const rows = wrapList({ prices: [{ productId: "111", net: 9.9, gross: 14 }] });
    expect(rows).toHaveLength(1);
    expect(mapPrice(rows[0], "111").purchasePrice).toBe(9.9);
  });

  it("maps the observed keyed price response", () => {
    const json = {
      "01527299": [
        {
          grossPrice: 831.0,
          netPrices: [
            {
              price: 601.48,
            },
          ],
        },
      ],
    };
    const rows = mapPricePayload(json);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.supplierArticleNumber).toBe("01527299");
    expect(rows[0]?.grossPrice).toBe(831);
    expect(rows[0]?.purchasePrice).toBe(601.48);
  });

  it("builds repeated ids query params", () => {
    expect(repeatQueryParams("ids", ["01527299", "01530198"])).toBe("ids=01527299&ids=01530198");
  });
});
