import { describe, expect, it } from "vitest";
import { applyRichnerPrices, createArrayScanner, mapPestalozzi, mapRichnerProducts, parseEngelVariants, unitPrice } from "./catalog";

describe("supplier catalogue", () => {
  it("divides a price per 10 units down to one unit", () => {
    expect(unitPrice({ publicGrossPrice: 45, customerNetPrice: null, priceUnitQuantity: 10 })).toBe(4.5);
  });
  it("prefers a customer net price over the public price", () => {
    expect(unitPrice({ publicGrossPrice: 100, customerNetPrice: 62, priceUnitQuantity: 1 })).toBe(62);
  });
  it("returns no price instead of inventing one", () => {
    expect(unitPrice({ publicGrossPrice: null, customerNetPrice: null, priceUnitQuantity: 1 })).toBeNull();
  });
  it("merges Richner prices and stock by article id", () => {
    const { hits } = mapRichnerProducts({ count: 1, products: [{ productIdentification: { suppliersProductIdentification: { suppliersProductId: "01526984" } }, productDescriptions: { brand: "Geberit", productDescription: "Aktivkohlefilter" } }] });
    const [h] = applyRichnerPrices(hits, { "01526984": [{ grossPrice: 40.5, priceBase: { numberOfUnits: 1, unitOfMeasurement: { unitCode: "STK" } } }] }, { "01526984": [{ stockQuantity: 7 }] });
    expect(h!.publicGrossPrice).toBe(40.5);
    expect(h!.priceUnit).toBe("Stk");
    expect(h!.stockQuantity).toBe(7);
  });
  it("keeps Pestalozzi price unit and does not claim stock", () => {
    const [h] = mapPestalozzi([{ sArticleID: "1", decPriceBrutto: 30, lngSalesPriceUnit: 10, sQuantityUnitSales: "SK", sAvailability: "locked-available" }]);
    expect(unitPrice(h!)).toBe(3);
    expect(h!.stockQuantity).toBeNull();
    expect(h!.availabilityStatus).toBeNull();
  });
  it("reads ENGEL variant prices by variant id", () => {
    const html = `<div class="gt-row gt-row-body x" data-groesseId="501" data-groesseNr="500079000"><div class="gt-text gt-cell">Rohr PE 32 mm</div><div id="groessePreis_501" class="gt-price" data-title="CHF&nbsp;exkl.&nbsp;MwSt per m: &nbsp;">8.71</div></div>`;
    const base = mapPestalozzi([{ sArticleID: "x" }])[0]!;
    const [v] = parseEngelVariants(html, { ...base, supplierId: "engel" });
    expect(v!.publicGrossPrice).toBe(8.71);
    expect(v!.priceUnit).toBe("m");
    expect(v!.vatIncluded).toBe(false);
  });
  it("streams only complete objects from a cut-off JSON list", () => {
    const s = createArrayScanner();
    s.push('[{"a":1,"t":"x}"},{"a":');
    s.push('2},{"a":3');
    expect(s.items).toEqual([{ a: 1, t: "x}" }, { a: 2 }]);
  });
});
