"use client";

import { useState } from "react";

import { continueTo } from "./form-client";
import styles from "./product.module.css";

export function LogoutButton({
  onLoggedOut = () => continueTo("/login"),
}: {
  onLoggedOut?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function logout() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (response.ok) onLoggedOut();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      className={styles.headerButton}
      type="button"
      onClick={logout}
      disabled={submitting}
    >
      {submitting ? "Logging out…" : "Log out"}
    </button>
  );
}
