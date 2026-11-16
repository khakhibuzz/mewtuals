import { describe, expect, it } from "vitest";
import { filterBatteryListings, type BatteryListing } from "../app/domain/battery-market";
import { filterBatteryPolicies, type BatteryPolicy } from "../app/domain/battery-policy";
const base: BatteryListing = {
  id: "pack", name: "24 V industrial pack", seller: "Example manufacturer", sellerType: "Manufacturer", category: "pack", chemistry: "LFP", voltage: "24 V", capacity: "20 Ah", purchaseRoute: "enquiry", availability: "Listed", price: null, quantityNote: null, leadTime: null, description: "Industrial battery", caveat: "Confirm compatibility", url: "https://example.com/pack", checkedAt: "2026-09-06",
};
describe("battery market search", () => {
  it("matches compact electrical units as well as spaced specifications", () => {
    const filters = { category: "all", chemistry: "all", purchaseRoute: "all" } as const;
    expect(filterBatteryListings([base], { ...filters, query: "24V 20Ah" })).toEqual([base]);
    expect(filterBatteryListings([base], { ...filters, query: "24 V 20 Ah" })).toEqual([base]);
  });
  it("combines search words with category, chemistry and purchase route", () => {
    const listings = [base, { ...base, id: "cell", category: "cell" as const, chemistry: null, purchaseRoute: "checkout" as const }];
    expect(filterBatteryListings(listings, { query: "24 manufacturer", category: "pack", chemistry: "LFP", purchaseRoute: "enquiry" })).toEqual([base]);
    expect(filterBatteryListings(listings, { query: "", category: "all", chemistry: "all", purchaseRoute: "checkout" }).map((item) => item.id)).toEqual(["cell"]);
    expect(filterBatteryListings(listings, { query: "nonexistent", category: "all", chemistry: "all", purchaseRoute: "all" })).toEqual([]);
  });
});
describe("battery policy ordering", () => {
  it("filters areas and puts the latest dated update first without mutating data", () => {
    const policies = [{ id: "old", area: "Recycling", date: "2024-01-01" }, { id: "new", area: "Recycling", date: "2026-01-01" }, { id: "other", area: "Manufacturing", date: "2025-01-01" }] as BatteryPolicy[];
    expect(filterBatteryPolicies(policies, "Recycling").map((item) => item.id)).toEqual(["new", "old"]);
    expect(policies[0].id).toBe("old");
  });
});

import { batteryListings } from "../app/data/battery-market-listings";
import { batteryPolicies } from "../app/data/battery-policies";
describe("market and policy evidence contracts", () => {
  it("preserves review dates and price scope for real purchase listings", () => {
    expect(new Set(batteryListings.map((item) => item.id)).size).toBe(batteryListings.length);
    for (const item of batteryListings) {
      expect(item.url).toMatch(/^https:\/\//);
      expect(item.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(item.caveat.length).toBeGreaterThan(20);
      if (item.price) {
        expect(item.price.amount).toBeGreaterThan(0);
        expect(item.price.taxNote).toMatch(/GST/);
        expect(item.price.unit).not.toBe("");
      }
    }
    expect(batteryListings.some((item) => item.availability === "Out of stock")).toBe(true);
    expect(batteryListings.some((item) => item.purchaseRoute === "enquiry" && item.price?.kind === "indicative")).toBe(true);
  });
  it("uses government sources and separates policy facts from interpretation", () => {
    expect(new Set(batteryPolicies.map((item) => item.id)).size).toBe(batteryPolicies.length);
    for (const item of batteryPolicies) {
      expect(item.date <= item.checkedAt).toBe(true);
      expect(item.change).not.toBe(item.impact);
      expect(item.limitation.length).toBeGreaterThan(30);
      expect(item.sources.length).toBeGreaterThan(0);
      for (const source of item.sources) {
        expect(new URL(source.url).hostname).toMatch(/\.(gov|nic)\.in$/);
        if (source.date) expect(source.date <= item.checkedAt).toBe(true);
      }
    }
  });
});
