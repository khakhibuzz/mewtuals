export type BatteryProductCategory = "cell" | "pack" | "bms" | "charger";
export type BatteryPurchaseRoute = "checkout" | "enquiry";
export interface BatteryListing {
  id: string;
  name: string;
  seller: string;
  sellerType: "Manufacturer" | "Retailer / distributor";
  category: BatteryProductCategory;
  chemistry: string | null;
  voltage: string | null;
  capacity: string | null;
  purchaseRoute: BatteryPurchaseRoute;
  availability: "Listed" | "In stock" | "Out of stock" | "Made to order";
  price: { amount: number; currency: "INR"; kind: "listed" | "indicative"; unit: string; taxNote: string } | null;
  quantityNote: string | null;
  leadTime: string | null;
  description: string;
  caveat: string;
  url: string;
  checkedAt: string;
}
export interface BatteryMarketFilter {
  query: string;
  category: BatteryProductCategory | "all";
  chemistry: string;
  purchaseRoute: BatteryPurchaseRoute | "all";
}
function normalizeProductSearch(value: string) {
  return value.toLowerCase().replace(/(\d)(?=(?:mah|ah|mwh|wh|v|a)\b)/g, "$1 ");
}

export function filterBatteryListings(listings: readonly BatteryListing[], filters: BatteryMarketFilter) {
  const words = normalizeProductSearch(filters.query).trim().split(/\s+/).filter(Boolean);
  return listings.filter((listing) => {
    const text = normalizeProductSearch([listing.name, listing.seller, listing.chemistry, listing.voltage, listing.capacity, listing.description].join(" "));
    return (filters.category === "all" || listing.category === filters.category)
      && (filters.chemistry === "all" || listing.chemistry === filters.chemistry)
      && (filters.purchaseRoute === "all" || listing.purchaseRoute === filters.purchaseRoute)
      && words.every((word) => text.includes(word));
  });
}
export const batteryCategoryLabels: Record<BatteryProductCategory, string> = {
  cell: "Cells", pack: "Battery packs", bms: "BMS", charger: "Chargers",
};
