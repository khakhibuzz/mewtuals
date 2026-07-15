"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ProductHydrationReady() {
  const hydrated = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );

  return (
    <span
      aria-hidden="true"
      data-product-hydrated={hydrated ? "true" : "false"}
      hidden
    />
  );
}
