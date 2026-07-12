"use client";

import { useEffect, useRef, useState } from "react";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#for-startups", label: "For startups" },
  { href: "#about", label: "About" },
  { href: "#apply", label: "Apply" },
] as const;

export function SiteHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

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
      <span className="wordmark">Mutuals</span>
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
          <a href={link.href} key={link.href} onClick={() => setIsOpen(false)}>
            {link.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
