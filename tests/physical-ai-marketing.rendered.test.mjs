import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("physical-ai-test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("homepage is a sparse Physical AI positioning surface", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /The External Partnerships function for Physical AI companies/);
  assert.match(html, /One partnership can change a robotics company\./);
  assert.match(html, /href="\/ecosystem">Explore the ecosystem<\/a>/);
  assert.match(html, /aria-label="Mewtuals at the centre of the Physical AI partnership ecosystem"/);
  assert.doesNotMatch(html, /id="how-it-works"|id="for-startups"/);
});

test("ecosystem route explains the chain and four Mewtuals outcomes", async () => {
  const response = await render("/ecosystem");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, />How the ecosystem fits together<\/h1>/);
  for (const stage of [
    "Components",
    "Manufacturing",
    "OEMs",
    "Integrators",
    "Distribution",
    "Media",
  ]) {
    assert.match(html, new RegExp(`>${stage}<`));
  }
  assert.match(html, />What Mewtuals can unlock<\/h2>/);
  for (const outcome of [
    "Supply chain access",
    "Distribution and pilots",
    "Media and visibility",
    "Ecosystem intelligence",
  ]) {
    assert.match(html, new RegExp(`>${outcome}<`));
  }
});

test("companies route preserves the company proposition", async () => {
  const response = await render("/companies");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(
    html,
    />Built for companies bringing intelligence into the physical world\.<\/h1>/,
  );
  assert.match(html, />Less corporate theatre\. More useful movement\.<\/p>/);
  assert.match(html, />The usual map<\/span>/);
  assert.match(html, />The Mewtuals map<\/span>/);
  assert.match(html, /href="\/join">Join Mewtuals<\/a>/);
});

test("public header exposes only the three approved destinations", async () => {
  const response = await render("/ecosystem");
  assert.equal(response.status, 200);
  const html = await response.text();
  const navigation = html.match(
    /<nav[^>]*aria-label="Primary navigation"[^>]*>([\s\S]*?)<\/nav>/,
  );

  assert.ok(navigation);
  const links = [...navigation[1].matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)];
  assert.deepEqual(
    links.map((link) => [link[2], link[1]]),
    [
      ["Ecosystem", "/ecosystem"],
      ["For companies", "/companies"],
      ["Join Mewtuals", "/join"],
    ],
  );
});
