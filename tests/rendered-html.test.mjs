import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the complete Mutuals landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Mutuals — Company representation<\/title>/i);
  assert.match(html, /Mutuals represents a company’s interests/);
  assert.match(html, /a human decision is required\./);

  for (const id of ["top", "how-it-works", "for-startups", "about", "apply"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  for (const label of ["How it works", "For startups", "About", "Apply"]) {
    assert.match(html, new RegExp(`>${label}<`));
  }

  assert.equal((html.match(/Illustrative case study/g) ?? []).length, 5);
  for (const label of ["Company URL", "Work email", "Phone number"]) {
    assert.match(html, new RegExp(`>${label}<`));
  }

  assert.doesNotMatch(html, /codex-preview|Codex is working|react-loading-skeleton/i);
});
