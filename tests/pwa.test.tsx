import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

import manifest from "../app/manifest";
import { metadata } from "../app/layout";
import OfflinePage from "../app/offline/page";
import PwaRegistration from "../app/pwa/PwaRegistration";
import {
  PUBLIC_ASSET_PATHS,
  createServiceWorkerSource,
} from "../app/pwa/service-worker-source";
import { GET } from "../app/sw.js/route";

const expectedPublicAssetPaths = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/mewtuals-192.png",
  "/icons/mewtuals-512.png",
  "/icons/apple-touch-icon.png",
  "/hero-opportunity-graph.png",
  "/hero-opportunity-graph.webp",
  "/hero-opportunity-graph-mobile.png",
  "/hero-opportunity-graph-mobile.webp",
];

describe("public-only PWA metadata", () => {
  it("declares the Mewtuals standalone manifest and maskable icons", () => {
    expect(manifest()).toMatchObject({
      name: "Mewtuals",
      short_name: "Mewtuals",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#f3f0e9",
      theme_color: "#11110f",
    });
    expect(manifest().icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/icons/mewtuals-192.png",
          sizes: "192x192",
          purpose: "any maskable",
        }),
        expect.objectContaining({
          src: "/icons/mewtuals-512.png",
          sizes: "512x512",
          purpose: "any maskable",
        }),
      ]),
    );
  });

  it("adds install metadata, Apple metadata, and an Apple icon to the root layout", () => {
    expect(metadata).toMatchObject({
      manifest: "/manifest.webmanifest",
      themeColor: "#11110f",
      appleWebApp: { capable: true, statusBarStyle: "default", title: "Mewtuals" },
    });
    expect(metadata.icons).toMatchObject({
      icon: "/favicon.svg",
      apple: "/icons/apple-touch-icon.png",
    });
  });
});

describe("network-required fallback", () => {
  it("contains no client state or member data and retries the requested URL with a link", () => {
    render(<OfflinePage />);

    expect(
      screen.getByRole("heading", { name: "Get online to see your partnerships." }),
    ).toBeVisible();
    expect(screen.getByText(/connection returns/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "?retry");
    expect(screen.getByRole("link", { name: /back to the landing page/i })).toHaveAttribute(
      "href",
      "/",
    );
  });
});

describe("service worker registration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("registers a module worker once when service workers are available", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });

    render(<PwaRegistration />);

    await vi.waitFor(() => {
      expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", type: "module" });
    });
  });

  it("does not render an error when registration rejects", async () => {
    const register = vi.fn().mockRejectedValue(new Error("unsupported"));
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });

    const { container } = render(<PwaRegistration />);

    await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("generated public-only service worker", () => {
  it("owns one complete allowlist for public assets", () => {
    expect(PUBLIC_ASSET_PATHS).toEqual(expectedPublicAssetPaths);
  });

  it("serves the generated JavaScript without stale route caching", async () => {
    const response = await GET();

    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("service-worker-allowed")).toBe("/");
    await expect(response.text()).resolves.toBe(createServiceWorkerSource());
  });

  it("limits install, activate, and fetch behavior to public cacheable resources", () => {
    const source = createServiceWorkerSource();

    expect(source).toContain('const CACHE_NAME = "mewtuals-');
    expect(source).toContain("event.waitUntil(installPublicShell())");
    expect(source).toContain('fetch("/", { credentials: "same-origin" })');
    expect(source).toContain('fetch("/offline", { credentials: "same-origin" })');
    expect(source).toContain("extractSameOriginAssetPaths");
    expect(source).toContain('pathname.startsWith("/assets/")');
    expect(source).toContain("PUBLIC_ASSET_PATHS.includes(pathname)");
    expect(source).toContain("request.method !== \"GET\"");
    expect(source).toContain('pathname.startsWith("/api/")');
    expect(source).toContain('pathname === "/"');
    expect(source).toContain('cache.put("/", response.clone())');
    expect(source).toContain('cache.match("/")');
    expect(source).toContain('cache.match("/offline")');
    expect(source).toContain('key.startsWith("mewtuals-") && key !== CACHE_NAME');
    expect(source).toContain("self.clients.claim()");
    expect(source).toContain("response.ok && !response.redirected && url.origin === self.location.origin");
  });
});
