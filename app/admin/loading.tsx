import { ProductShell } from "../components/product/ProductShell";
import styles from "../components/product/product.module.css";

export default function AdminLoading() {
  return (
    <ProductShell eyebrow="Operations" title="Administrator" wide>
      <p aria-live="polite" className={styles.status} role="status">
        Loading administrator view…
      </p>
    </ProductShell>
  );
}
