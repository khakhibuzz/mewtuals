export const PUBLIC_ASSET_PATHS = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/mewtuals-192.png",
  "/icons/mewtuals-512.png",
  "/icons/apple-touch-icon.png",
  "/hero-opportunity-graph.png",
  "/hero-opportunity-graph.webp",
  "/hero-opportunity-graph-mobile.png",
  "/hero-opportunity-graph-mobile.webp",
] as const;

const CACHE_VERSION = "v1";

export function createServiceWorkerSource(): string {
  return `
const CACHE_NAME = "mewtuals-${CACHE_VERSION}";
const PUBLIC_ASSET_PATHS = ${JSON.stringify(PUBLIC_ASSET_PATHS)};

function isCacheableResponse(response) {
  const url = new URL(response.url || self.location.origin);
  return response.ok && !response.redirected && url.origin === self.location.origin;
}

function isPublicAssetPath(pathname) {
  return pathname.startsWith("/assets/") || PUBLIC_ASSET_PATHS.includes(pathname);
}

function extractSameOriginAssetPaths(html) {
  const assetPaths = new Set();
  const references = html.matchAll(/(?:src|href)=["']([^"']+)["']/gi);

  for (const [, reference] of references) {
    const url = new URL(reference, self.location.origin);
    if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
      assetPaths.add(url.pathname + url.search);
    }
  }

  return [...assetPaths];
}

async function fetchRequired(pathname) {
  const response = await fetch(pathname, { credentials: "same-origin" });
  if (!isCacheableResponse(response)) {
    throw new Error("Public shell response was not cacheable: " + pathname);
  }
  return response;
}

async function installPublicShell() {
  const cache = await caches.open(CACHE_NAME);

  try {
    const [landingResponse, offlineResponse] = await Promise.all([
      fetch("/", { credentials: "same-origin" }),
      fetch("/offline", { credentials: "same-origin" }),
    ]);

    if (!isCacheableResponse(landingResponse) || !isCacheableResponse(offlineResponse)) {
      throw new Error("Public shell documents were not cacheable");
    }

    const assetPaths = [...new Set([
      ...PUBLIC_ASSET_PATHS,
      ...extractSameOriginAssetPaths(await landingResponse.clone().text()),
      ...extractSameOriginAssetPaths(await offlineResponse.clone().text()),
    ])];
    const assetResponses = await Promise.all(assetPaths.map(fetchRequired));

    await Promise.all([
      cache.put("/", landingResponse.clone()),
      cache.put("/offline", offlineResponse.clone()),
      ...assetResponses.map((response, index) => cache.put(assetPaths[index], response.clone())),
    ]);
  } catch (error) {
    await caches.delete(CACHE_NAME);
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function rootNavigation(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      await cache.put("/", response.clone());
    }
    return response;
  } catch {
    return (await cache.match("/")) || (await cache.match("/offline")) || Response.error();
  }
}

async function networkOnlyDocument(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match("/offline")) || Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(installPublicShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("mewtuals-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(url.pathname === "/" ? rootNavigation(request) : networkOnlyDocument(request));
    return;
  }

  if (isPublicAssetPath(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
`;
}
