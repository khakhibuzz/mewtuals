import type { BatteryListing, BatteryProductCategory } from "../../domain/battery-market";
import styles from "./battery-sections.module.css";

function ProductIllustration({ category }: { category: BatteryProductCategory }) {
  return <svg className={styles.productIcon} viewBox="0 0 80 60" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    {category === "cell" ? <>{[14, 32, 50].map((x) => <g key={x}><rect x={x} y="10" width="14" height="40" rx="6" /><path d={`M${x + 4} 7h6M${x + 3} 17h8`} /></g>)}</>
      : category === "bms" ? <><rect x="13" y="10" width="54" height="40" rx="3" /><rect x="31" y="21" width="18" height="18" /><path d="M18 20h8m-8 9h8m-8 10h8m28-19h8m-8 9h8m-8 10h8M36 14v6m8-6v6m-8 20v6m8-6v6" /></>
        : category === "charger" ? <><rect x="20" y="12" width="38" height="36" rx="5" /><path d="M30 12V5m16 7V5M58 30h10v20M38 22l-5 10h10l-5 9" /></>
          : <><rect x="10" y="17" width="60" height="34" rx="4" /><path d="M20 17v-6h10v6m20 0v-6h10v6M20 30h10m-5-5v10m25-5h10M34 43h12" /></>}
  </svg>;
}

export function BatteryProductCard({ listing }: { listing: BatteryListing }) {
  const price = listing.price ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(listing.price.amount) : listing.purchaseRoute === "checkout" ? "See seller price" : "Request a quote";
  const action = listing.availability === "Out of stock" ? "Check restock at seller" : listing.purchaseRoute === "checkout" ? "View & buy at seller" : "Enquire with supplier";
  return <article className={styles.product} aria-label={listing.name}>
    <div className={styles.productTop}><ProductIllustration category={listing.category} /><span className={styles.badge} data-status={listing.availability}>{listing.availability} · at review</span></div>
    <p className={styles.seller}>{listing.seller} · {listing.sellerType}</p>
    <h2>{listing.name}</h2>
    <p className={styles.description}>{listing.description}</p>
    <dl className={styles.specs}>
      <div><dt>Chemistry</dt><dd>{listing.chemistry ?? "Not stated"}</dd></div>
      <div><dt>Voltage</dt><dd>{listing.voltage ?? "Confirm model"}</dd></div>
      <div><dt>Capacity</dt><dd>{listing.capacity ?? "Not stated"}</dd></div>
    </dl>
    <p className={styles.price}>{price}</p>
    <p className={styles.priceScope}>{listing.price ? `${listing.price.kind === "indicative" ? "Indicative · " : "Listed price · "}${listing.price.unit} · ${listing.price.taxNote}` : listing.purchaseRoute === "checkout" ? "Confirm the current price and tax treatment at checkout." : "Final pricing depends on the supplier’s offer."}</p>
    <p className={styles.commercial}><strong>Order quantity:</strong> {listing.quantityNote ?? "Minimum / bulk quantity not stated."}<br /><strong>Lead time:</strong> {listing.leadTime ?? "Confirm with seller."}</p>
    <details className={styles.caveat}><summary>What to confirm before ordering ↓</summary><p>{listing.caveat}</p></details>
    <div className={styles.productFooter}>
      <a className={styles.cta} href={listing.url} target="_blank" rel="noreferrer" aria-label={`${action}: ${listing.name}`}>{action} ↗</a>
      <p className={styles.sellerCheck}>{listing.purchaseRoute === "checkout" ? "Seller checkout listing" : "Supplier enquiry listing"} · Checked {listing.checkedAt}. Price and availability can change.</p>
    </div>
  </article>;
}
