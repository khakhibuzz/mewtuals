"use client";

import { useEffect, useRef, useState } from "react";

function navigationLinks(anchorBase: "" | "/") {
  return [
    { href: `${anchorBase}#how-it-works`, label: "How it works" },
    { href: `${anchorBase}#for-startups`, label: "For startups" },
    { href: "/join", label: "For creators", productEntry: true },
    { href: "/join", label: "Join Mewtuals", primary: true },
    { href: "/login", label: "Log in", productEntry: true },
  ] as const;
}

export function SiteHeader({ anchorBase = "" }: { anchorBase?: "" | "/" }) {
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const links = navigationLinks(anchorBase);

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
      <span className="wordmark">Mewtuals</span>
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
          <a
            className={
              "primary" in link && link.primary
                ? "header-primary-link"
                : "productEntry" in link && link.productEntry
                  ? "header-product-link"
                  : undefined
            }
            href={link.href}
            key={link.label}
            onClick={() => setIsOpen(false)}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
