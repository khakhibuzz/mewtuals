"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { batteryListings } from "../../data/battery-market-listings";
import { batteryCategoryLabels, filterBatteryListings, type BatteryMarketFilter } from "../../domain/battery-market";
import { BatterySectionHeader } from "./BatterySectionHeader";
import { BatteryProductCard } from "./BatteryProductCard";
import styles from "./battery-sections.module.css";
const initialFilters: BatteryMarketFilter = { query: "", category: "all", chemistry: "all", purchaseRoute: "all" };
const subscribe = () => () => {};
export function BatteryMarket() {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [filters, setFilters] = useState(initialFilters);
  const listings = useMemo(() => filterBatteryListings(batteryListings, filters), [filters]);
  const chemistries = [...new Set(batteryListings.flatMap((item) => item.chemistry ? [item.chemistry] : []))].sort();
  function update<K extends keyof BatteryMarketFilter>(key: K, value: BatteryMarketFilter[K]) { setFilters((current) => ({ ...current, [key]: value })); }
  return <main className={styles.page} data-hydrated={hydrated}>
    <BatterySectionHeader current="market" title="Market catalog" description="Find batteries and components sold into India. Compare the published specifications, then buy or request a quote directly from the seller." />
    <div className={styles.filters} role="search" aria-label="Battery product filters">
      <label>Search products<input type="search" value={filters.query} onChange={(event) => update("query", event.target.value)} placeholder="Voltage, chemistry, product or seller" /></label>
      <label>Product type<select value={filters.category} onChange={(event) => update("category", event.target.value as BatteryMarketFilter["category"])}><option value="all">All product types</option>{Object.entries(batteryCategoryLabels).filter(([value]) => batteryListings.some((item) => item.category === value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Chemistry<select value={filters.chemistry} onChange={(event) => update("chemistry", event.target.value)}><option value="all">All chemistries</option>{chemistries.map((chemistry) => <option key={chemistry}>{chemistry}</option>)}</select></label>
      <label>Purchase route<select value={filters.purchaseRoute} onChange={(event) => update("purchaseRoute", event.target.value as BatteryMarketFilter["purchaseRoute"])}><option value="all">Buy or enquire</option><option value="checkout">Seller checkout</option><option value="enquiry">Supplier enquiry</option></select></label>
    </div>
    <div className={styles.summary}><p role="status">{listings.length} of {batteryListings.length} listings · {new Set(batteryListings.map((item) => item.seller)).size} sellers</p><p>Seller-reported specifications. Stock is a dated snapshot.</p></div>
    {listings.length ? <div className={styles.grid} aria-label="Battery products">{listings.map((listing) => <BatteryProductCard key={listing.id} listing={listing} />)}</div> : <div className={styles.empty}><h2>No matching products</h2><p>Try another voltage, chemistry or purchase route.</p><button type="button" onClick={() => setFilters(initialFilters)}>Clear filters</button></div>}
    <p className={styles.footnote}>Purchases and enquiries happen on the seller’s website. Confirm the exact cell model, BMS, connector, intended use, shipping terms and product-specific test documents before ordering. A listed voltage alone does not establish compatibility. Category diagrams are illustrations, not product photos.</p>
  </main>;
}
