import { createServiceWorkerSource } from "../pwa/service-worker-source";

export function GET() {
  return new Response(createServiceWorkerSource(), {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "text/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
    },
  });
}
