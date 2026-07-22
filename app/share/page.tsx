import styles from "./share.module.css";
import { generateShareQrDataUrl } from "./share-qr";

export default async function SharePage() {
  const qrDataUrl = await generateShareQrDataUrl();

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="share-heading">
        <p className={styles.wordmark}>Mewtuals</p>

        <div className={styles.introduction}>
          <h1 id="share-heading">Scan to join Mewtuals</h1>
          <p>
            One partnership can change a company. Mewtuals helps you find the
            right one.
          </p>
        </div>

        <div className={styles.qrFrame}>
          {/* A data URL does not benefit from framework image optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR code to join Mewtuals" />
        </div>

        <a className={styles.fallbackLink} href="/join">
          mewtuals.com/join
        </a>
      </section>
    </main>
  );
}
