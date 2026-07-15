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

test("server-renders the complete Mewtuals landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>Mewtuals — Partnerships for internet-native companies<\/title>/,
  );
  assert.match(html, /class="wordmark">Mewtuals<\/span>/);
  assert.match(
    html,
    />The external partnerships function for internet-native companies\.<\/p>/,
  );
  assert.match(html, /One partnership can change a company\./);
  assert.match(html, />We find the right one\.<\/strong>/);
  assert.match(
    html,
    />Mewtuals researches your company, identifies where another organisation can unlock growth, and advances the relationship from hypothesis to pilot\.<\/p>/,
  );
  assert.match(html, />Built for companies that move at internet speed\.<\/h2>/);
  assert.match(
    html,
    />AI startups, creator-economy companies, and consumer brands already live where reputation, distribution, and demand move quickly\. We learn the company as it is now, then advance the relationships that can support its next step\.<\/p>/,
  );
  assert.match(html, />Less corporate theatre\. More useful movement\.<\/p>/);
  assert.match(html, />Less corporate in tone\. Exacting in practice\.<\/h2>/);
  assert.match(
    html,
    />Mewtuals represents internet-native companies with the same seriousness as a traditional partnerships firm—without the theatre, jargon, or distance\.<\/p>/,
  );
  assert.match(
    html,
    />We map complementary needs, assets, timing, trust, and customer touchpoints, then carry the work until a decision belongs with the people responsible for it\.<\/p>/,
  );
  assert.match(html, />The Mewtuals map<\/span>/);
  assert.match(html, /aria-label="How Mewtuals changes the business map"/);
  assert.match(html, />Put Mewtuals on your company’s side\.<\/h2>/);
  assert.match(html, /href="#apply">Find my next partnership<\/a>/);
  assert.match(
    html,
    /<meta name="description" content="Mewtuals identifies and advances high-value partnerships for AI startups, creator-economy companies, and consumer brands\."\/?>/,
  );
  assert.match(
    html,
    /<link(?=[^>]*\brel=["']icon["'])(?=[^>]*\bhref=["']\/favicon\.svg["'])[^>]*>/i,
  );

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

  assert.doesNotMatch(html, /<title>Mutuals —/);
  assert.doesNotMatch(html, /class="wordmark">Mutuals<\/span>/);
  assert.doesNotMatch(html, /Your external partnerships function\./);
  assert.doesNotMatch(html, /A startup begins as a small living idea\./);
  assert.doesNotMatch(html, /Competition explains how value is divided\./);
  assert.doesNotMatch(html, /codex-preview|Codex is working|react-loading-skeleton/i);
});
