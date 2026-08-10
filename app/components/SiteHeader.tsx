"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function navigationLinks() {
  return [
    { href: "/ecosystem", label: "Ecosystem" },
    { href: "/companies", label: "For companies" },
    { href: "/join", label: "Join Mewtuals", primary: true },
  ] as const;
}

export function SiteHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const links = navigationLinks();

  useEffect(() => {
    if (!isOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      setIsOpen(false);
      queueMicrotask(() => toggleRef.current?.focus());
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <header className="site-header">
      <Link
        aria-label="Mewtuals home"
        className="wordmark"
        href="/"
        prefetch={false}
      >
        <span aria-hidden="true" className="wordmark-mark">
          M
        </span>
        <span>Mewtuals</span>
      </Link>
      <button
        aria-controls="primary-navigation"
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close navigation" : "Open navigation"}
        className="navigation-toggle"
        onClick={() => setIsOpen((current) => !current)}
        ref={toggleRef}
        type="button"
      >
        {isOpen ? "Close" : "Menu"}
      </button>
      <nav
        aria-label="Primary navigation"
        className={`primary-navigation${isOpen ? " is-open" : ""}`}
        id="primary-navigation"
      >
        {links.map((link) => (
          <Link
            className={
              "primary" in link && link.primary ? "header-primary-link" : undefined
            }
            href={link.href}
            key={link.label}
            onClick={() => setIsOpen(false)}
            prefetch={false}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
