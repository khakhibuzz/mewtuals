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
  WORKER_TEMPLATE,
  createCacheName,
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

type WorkerRequest = {
  method: string;
  mode: string;
  url: string;
};

type WorkerHarness = {
  cache: (name?: string) => FakeCache;
  dispatchFetch: (request: WorkerRequest) => Promise<{
    intercepted: boolean;
    response?: Response;
    waitForBackground: () => Promise<void>;
  }>;
  dispatchLifecycle: (type: "install" | "activate") => Promise<void>;
  fetchCalls: string[];
};

type WorkerEvent = {
  request?: WorkerRequest;
  respondWith?: (response: Response | Promise<Response>) => void;
  waitUntil: (work: Promise<unknown>) => void;
};

class FakeCache {
  readonly entries = new Map<string, Response>();

  constructor(private readonly failPut?: (key: string) => boolean) {}

  async match(request: string | WorkerRequest) {
    const response = this.entries.get(cacheKey(request));
    return response?.clone();
  }

  async put(request: string | WorkerRequest, response: Response) {
    const key = cacheKey(request);
    if (this.failPut?.(key)) throw new Error(`cache write failed for ${key}`);
    this.entries.set(key, response.clone());
  }
}

function cacheKey(request: string | WorkerRequest) {
  if (typeof request === "string") return request;
  const url = new URL(request.url);
  return url.pathname + url.search;
}

function documentRequest(pathname: string): WorkerRequest {
  return {
    method: "GET",
    mode: "navigate",
    url: `https://mewtuals.test${pathname}`,
  };
}

function assetRequest(pathname: string): WorkerRequest {
  return {
    method: "GET",
    mode: "no-cors",
    url: `https://mewtuals.test${pathname}`,
  };
}

function createWorkerHarness(options: {
  fetchResponse: (pathname: string) => Promise<Response> | Response;
  failPut?: (key: string) => boolean;
  initialCaches?: Map<string, FakeCache>;
}): WorkerHarness {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const cacheName = createCacheName(WORKER_TEMPLATE);
  const cacheMap = options.initialCaches ?? new Map<string, FakeCache>();
  const fetchCalls: string[] = [];
  const caches = {
    async delete(name: string) {
      return cacheMap.delete(name);
    },
    async keys() {
      return [...cacheMap.keys()];
    },
    async open(name: string) {
      if (!cacheMap.has(name)) cacheMap.set(name, new FakeCache(options.failPut));
      return cacheMap.get(name)!;
    },
  };
  const self = {
    addEventListener(type: string, handler: (event: WorkerEvent) => void) {
      listeners.set(type, handler);
    },
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
    location: { origin: "https://mewtuals.test" },
  };
  const fetch = async (request: string | WorkerRequest) => {
    const pathname = typeof request === "string" ? request : cacheKey(request);
    fetchCalls.push(pathname);
    return options.fetchResponse(pathname);
  };

  new Function("self", "caches", "fetch", "Response", createServiceWorkerSource())(
    self,
    caches,
    fetch,
    Response,
  );

  return {
    cache(name = cacheName) {
      if (!cacheMap.has(name)) cacheMap.set(name, new FakeCache(options.failPut));
      return cacheMap.get(name)!;
    },
    async dispatchFetch(request) {
      const waits: Promise<unknown>[] = [];
      let responsePromise: Promise<Response> | undefined;
      listeners.get("fetch")?.({
        request,
        respondWith(response: Response | Promise<Response>) {
          responsePromise = Promise.resolve(response);
        },
        waitUntil(work: Promise<unknown>) {
          waits.push(work);
        },
      });

      return {
        intercepted: responsePromise !== undefined,
        response: responsePromise ? await responsePromise : undefined,
        waitForBackground: async () => {
          await Promise.all(waits);
        },
      };
    },
    async dispatchLifecycle(type) {
      const waits: Promise<unknown>[] = [];
      listeners.get(type)?.({
        waitUntil(work: Promise<unknown>) {
          waits.push(work);
        },
      });
      await Promise.all(waits);
    },
    fetchCalls,
  };
}

function publicShellResponder(pathname: string): Response {
  if (pathname === "/") {
    return new Response('<script src="/assets/landing-public.js"></script>', { status: 200 });
  }
  if (pathname === "/offline") return new Response("offline page", { status: 200 });
  if (pathname === "/assets/landing-public.js") return new Response("landing asset", { status: 200 });
  if (expectedPublicAssetPaths.includes(pathname)) return new Response("public asset", { status: 200 });
  throw new Error(`unexpected network request for ${pathname}`);
}

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

  it("isolates every worker revision so a failed install cannot delete the active cache", () => {
    const activeCacheName = createCacheName(WORKER_TEMPLATE);
    const revisedCacheName = createCacheName(`${WORKER_TEMPLATE}\n// revised worker logic`);
    const source = createServiceWorkerSource();

    expect(activeCacheName).toMatch(/^mewtuals-[a-z0-9]+$/);
    expect(revisedCacheName).not.toBe(activeCacheName);
    expect(source).toContain(`const CACHE_NAME = "${activeCacheName}"`);
    expect(source).toContain("await caches.delete(CACHE_NAME);");
  });
});

describe("service worker cache behavior", () => {
  it("stages the public shell, exact allowlist, and discovered landing assets", async () => {
    const worker = createWorkerHarness({ fetchResponse: publicShellResponder });

    await worker.dispatchLifecycle("install");

    expect([...worker.cache().entries.keys()].sort()).toEqual(
      expect.arrayContaining([
        "/",
        "/offline",
        ...expectedPublicAssetPaths,
        "/assets/landing-public.js",
      ]),
    );
  });

  it("does not cache unknown login or product assets after they are fetched", async () => {
    const worker = createWorkerHarness({
      fetchResponse: (pathname) =>
        pathname === "/assets/login-product.js"
          ? new Response("member bundle", { status: 200 })
          : publicShellResponder(pathname),
    });
    await worker.dispatchLifecycle("install");
    const cachedBefore = [...worker.cache().entries.keys()].sort();

    const result = await worker.dispatchFetch(assetRequest("/assets/login-product.js"));

    expect(result.intercepted).toBe(true);
    await expect(result.response?.text()).resolves.toBe("member bundle");
    expect([...worker.cache().entries.keys()].sort()).toEqual(cachedBefore);
  });

  it("leaves API calls to the network without an interception or cache entry", async () => {
    const worker = createWorkerHarness({ fetchResponse: publicShellResponder });
    await worker.dispatchLifecycle("install");
    const cachedBefore = [...worker.cache().entries.keys()].sort();

    const result = await worker.dispatchFetch({
      method: "GET",
      mode: "cors",
      url: "https://mewtuals.test/api/signal",
    });

    expect(result.intercepted).toBe(false);
    expect(worker.fetchCalls).not.toContain("/api/signal");
    expect([...worker.cache().entries.keys()].sort()).toEqual(cachedBefore);
  });

  it("uses the public root cache offline and the offline document for member routes", async () => {
    let offline = false;
    const worker = createWorkerHarness({
      fetchResponse: (pathname) => {
        if (offline && (pathname === "/" || pathname === "/dashboard")) {
          throw new Error("offline");
        }
        return publicShellResponder(pathname);
      },
    });
    await worker.dispatchLifecycle("install");
    offline = true;

    const root = await worker.dispatchFetch(documentRequest("/"));
    const member = await worker.dispatchFetch(documentRequest("/dashboard"));

    await expect(root.response?.text()).resolves.toContain("landing-public.js");
    await expect(member.response?.text()).resolves.toBe("offline page");
  });

  it("keeps the old root shell when a best-effort refresh cache step fails", async () => {
    let failRefreshCacheWrites = false;
    const worker = createWorkerHarness({
      failPut: (key) =>
        failRefreshCacheWrites && (key === "/assets/new-root.js" || key === "/"),
      fetchResponse: (pathname) => {
        if (pathname === "/") {
          return new Response('<script src="/assets/new-root.js"></script>', { status: 200 });
        }
        if (pathname === "/assets/new-root.js") return new Response("new root asset", { status: 200 });
        return publicShellResponder(pathname);
      },
    });
    await worker.cache().put("/", new Response("old root", { status: 200 }));
    failRefreshCacheWrites = true;

    const result = await worker.dispatchFetch(documentRequest("/"));

    await expect(result.response?.text()).resolves.toContain("new-root.js");
    await result.waitForBackground();
    await expect(worker.cache().match("/").then((response) => response?.text())).resolves.toBe(
      "old root",
    );
  });

  it("preserves a prior revision cache when a new worker install fails", async () => {
    const priorCacheName = createCacheName(`${WORKER_TEMPLATE}\n// prior revision`);
    const priorCache = new FakeCache();
    await priorCache.put("/", new Response("prior root", { status: 200 }));
    const worker = createWorkerHarness({
      initialCaches: new Map([[priorCacheName, priorCache]]),
      fetchResponse: (pathname) => {
        if (pathname === "/") throw new Error("install failed");
        return publicShellResponder(pathname);
      },
    });

    await expect(worker.dispatchLifecycle("install")).rejects.toThrow("install failed");
    await expect(priorCache.match("/").then((response) => response?.text())).resolves.toBe("prior root");
  });
});
