import Link from "next/link";

import styles from "./product.module.css";

export function FormSubmissionAlert({
  message,
  sessionExpired,
}: {
  message?: string;
  sessionExpired: boolean;
}) {
  if (!message) return null;

  return (
    <p className={styles.error} role="alert">
      {message}
      {sessionExpired ? (
        <>
          {" "}
          <Link href="/login">Sign in</Link>
        </>
      ) : null}
    </p>
  );
}
