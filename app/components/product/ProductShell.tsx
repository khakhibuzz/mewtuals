import type { ReactNode } from "react";
import Link from "next/link";

import { LogoutButton } from "./LogoutButton";
import { ProductHydrationReady } from "./ProductHydrationReady";
import styles from "./product.module.css";

type ProductShellProps = {
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
  headerAction?: { href: string; label: string };
};

export function ProductShell({
  eyebrow,
  title,
  intro,
  children,
  headerAction,
}: ProductShellProps) {
  return (
    <div className={styles.shell}>
      <ProductHydrationReady />
      <header className={styles.header}>
        <Link className={styles.wordmark} href="/" aria-label="Mewtuals home">
          Mewtuals
        </Link>
        {headerAction ? (
          <Link className={styles.headerLink} href={headerAction.href}>
            {headerAction.label}
          </Link>
        ) : (
          <LogoutButton />
        )}
      </header>
      <main className={styles.main}>
        <section className={styles.panel}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
          {intro ? <p className={styles.intro}>{intro}</p> : null}
          {children}
        </section>
      </main>
    </div>
  );
}
