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

const CACHE_NAME_PLACEHOLDER = "__MEWTUALS_CACHE_NAME__";

export function createCacheName(workerTemplate: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < workerTemplate.length; index += 1) {
    hash ^= workerTemplate.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `mewtuals-${(hash >>> 0).toString(36)}`;
}

export const WORKER_TEMPLATE = String.raw`
const CACHE_NAME = "${CACHE_NAME_PLACEHOLDER}";
const PUBLIC_ASSET_PATHS = ${JSON.stringify(PUBLIC_ASSET_PATHS)};

function isCacheableResponse(response) {
  const url = new URL(response.url || self.location.origin);
  return response.ok && !response.redirected && url.origin === self.location.origin;
}

function isPublicAssetPath(pathname) {
  return PUBLIC_ASSET_PATHS.includes(pathname);
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

  const linkTags = html.matchAll(/<link\b[^>]*>/gi);
  for (const [linkTag] of linkTags) {
    const rel = linkTag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1];
    const href = linkTag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!rel || !href || !rel.toLowerCase().split(/\s+/).includes("stylesheet")) {
      continue;
    }

    const url = new URL(href, self.location.origin);
    if (url.origin === self.location.origin) {
      assetPaths.add(url.pathname + url.search);
    }
  }

  return [...assetPaths];
}

async function fetchRequired(pathname) {
  const url = new URL(pathname, self.location.origin);
  const request = url.pathname.endsWith(".css")
    ? new Request(url, {
        credentials: "same-origin",
        headers: { Accept: "text/css,*/*;q=0.1" },
      })
    : pathname;
  const response = await fetch(request, { credentials: "same-origin" });
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

async function stagedAssetOrNetwork(request) {
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(request)) || fetch(request);
}

async function refreshRootShell(response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const assetPaths = extractSameOriginAssetPaths(await response.clone().text());
    const assetResponses = await Promise.all(assetPaths.map(fetchRequired));

    await Promise.all(
      assetResponses.map((assetResponse, index) =>
        cache.put(assetPaths[index], assetResponse.clone()),
      ),
    );
    await cache.put("/", response.clone());
  } catch {
    // The current navigation already has a valid network response; retain the old shell on refresh failure.
  }
}

function rootNavigation(event) {
  const request = event.request;
  const networkResponse = fetch(request);

  event.waitUntil(
    networkResponse
      .then((response) => (isCacheableResponse(response) ? refreshRootShell(response.clone()) : undefined))
      .catch(() => undefined),
  );

  return networkResponse.catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match("/")) || (await cache.match("/offline")) || Response.error();
  });
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
    event.respondWith(url.pathname === "/" ? rootNavigation(event) : networkOnlyDocument(request));
    return;
  }

  if (isPublicAssetPath(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(stagedAssetOrNetwork(request));
    return;
  }

  event.respondWith(stagedAssetOrNetwork(request));
});
`;

export function createServiceWorkerSource(): string {
  return WORKER_TEMPLATE.replace(CACHE_NAME_PLACEHOLDER, createCacheName(WORKER_TEMPLATE));
}
