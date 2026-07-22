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
  headerLinks?: readonly { href: string; label: string }[];
  wide?: boolean;
};

export function ProductShell({
  eyebrow,
  title,
  intro,
  children,
  headerAction,
  headerLinks,
  wide = false,
}: ProductShellProps) {
  return (
    <div className={styles.shell}>
      <ProductHydrationReady />
      <header className={styles.header}>
        <Link className={styles.wordmark} href="/" aria-label="Mewtuals home">
          Mewtuals
        </Link>
        {headerLinks ? (
          <div className={styles.headerControls}>
            <nav className={styles.headerNav} aria-label="Administrator">
              {headerLinks.map((link) => (
                <Link className={styles.headerLink} href={link.href} key={link.href}>
                  {link.label}
                </Link>
              ))}
            </nav>
            <LogoutButton />
          </div>
        ) : headerAction ? (
          <Link className={styles.headerLink} href={headerAction.href}>
            {headerAction.label}
          </Link>
        ) : (
          <LogoutButton />
        )}
      </header>
      <main className={styles.main}>
        <section className={wide ? styles.panelWide : styles.panel}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
          {intro ? <p className={styles.intro}>{intro}</p> : null}
          {children}
        </section>
      </main>
    </div>
  );
}
