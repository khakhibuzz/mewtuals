import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
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

async function readCompiledStyles() {
  const assetsDirectory = new URL("../dist/client/assets/", import.meta.url);
  const stylesheets = (await readdir(assetsDirectory)).filter((file) =>
    file.endsWith(".css"),
  );

  return (
    await Promise.all(
      stylesheets.map((file) => readFile(new URL(file, assetsDirectory), "utf8")),
    )
  ).join("\n");
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
  assert.match(
    html,
    /alt="Qualitative Mewtuals partnership progression: Signal captured, Conversation initiated, Interest aligned, and Human decision required\."/,
  );
  assert.doesNotMatch(
    html,
    /alt="Opportunity movement from signal captured through conversation and aligned interest to a human decision"/,
  );
  assert.doesNotMatch(
    html,
    /alt="Qualitative Mewtuals partnership progression from signal captured through conversation and aligned interest to a human decision"/,
  );
  assert.match(html, /<picture>/);
  assert.match(
    html,
    /<source(?=[^>]*\bmedia="\(max-width: 640px\)")(?=[^>]*\bsrcSet="\/hero-opportunity-graph-mobile\.webp")(?=[^>]*\btype="image\/webp")[^>]*>/,
  );
  assert.match(
    html,
    /<source(?=[^>]*\bmedia="\(max-width: 640px\)")(?=[^>]*\bsrcSet="\/hero-opportunity-graph-mobile\.png")(?=[^>]*\btype="image\/png")[^>]*>/,
  );
  assert.match(
    html,
    /<source(?=[^>]*\bsrcSet="\/hero-opportunity-graph\.webp")(?=[^>]*\btype="image\/webp")[^>]*>/,
  );
  assert.match(html, />Built for companies that move at internet speed\.<\/h2>/);
  assert.match(
    html,
    />AI startups, creator-economy companies, and consumer brands already live where reputation, distribution, and demand move quickly\. We learn the company as it is now, then advance the relationships that can support its next step\.<\/p>/,
  );
  assert.match(html, />Less corporate theatre\. More useful movement\.<\/p>/);
  assert.match(html, />The usual map<\/span>/);
  assert.match(html, />The Mewtuals map<\/span>/);
  assert.match(html, /aria-label="How Mewtuals changes the business map"/);
  assert.match(html, /href="\/join">Find my next partnership<\/a>/);
  assert.match(html, /href="#how-it-works">See how it works<\/a>/);
  assert.match(html, /href="\/join">For creators<\/a>/);
  assert.match(html, /href="\/join">Join Mewtuals<\/a>/);
  assert.match(html, /href="\/login">Log in<\/a>/);
  assert.match(
    html,
    /<meta name="description" content="Mewtuals identifies and advances high-value partnerships for AI startups, creator-economy companies, and consumer brands\."\/?>/,
  );
  assert.match(
    html,
    /<meta(?=[^>]*\bname=["']theme-color["'])(?=[^>]*\bcontent=["']#11110f["'])[^>]*>/i,
  );
  assert.match(
    html,
    /<meta(?=[^>]*\bproperty=["']og:image["'])(?=[^>]*\bcontent=["']https:\/\/mewtuals\.com\/og\.png["'])[^>]*>/i,
  );
  assert.match(
    html,
    /<meta(?=[^>]*\bname=["']twitter:image["'])(?=[^>]*\bcontent=["']https:\/\/mewtuals\.com\/og\.png["'])[^>]*>/i,
  );
  assert.match(
    html,
    /<link(?=[^>]*\brel=["']icon["'])(?=[^>]*\bhref=["']\/favicon\.svg["'])[^>]*>/i,
  );

  for (const id of ["top", "how-it-works", "for-startups"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  for (const label of [
    "How it works",
    "For startups",
    "For creators",
    "Join Mewtuals",
    "Log in",
  ]) {
    assert.match(html, new RegExp(`>${label}<`));
  }

  const orderedSectionIds = [
    "top",
    "how-it-works",
    "for-startups",
  ];
  const sectionOffsets = orderedSectionIds.map((id) => html.indexOf(`id="${id}"`));
  assert.deepEqual(sectionOffsets, [...sectionOffsets].sort((left, right) => left - right));

  assert.equal((html.match(/Illustrative case study/g) ?? []).length, 5);
  assert.doesNotMatch(html, /<title>Mutuals —/);
  assert.doesNotMatch(html, /class="wordmark">Mutuals<\/span>/);
  assert.doesNotMatch(html, /Your external partnerships function\./);
  assert.doesNotMatch(html, /A startup begins as a small living idea\./);
  assert.doesNotMatch(html, /Competition explains how value is divided\./);
  assert.doesNotMatch(html, /Less corporate in tone\. Exacting in practice\./);
  assert.doesNotMatch(html, /Put Mewtuals on your company’s side\./);
  assert.doesNotMatch(html, /class="startup-stages"/);
  assert.doesNotMatch(html, /id="about"|id="apply"/);
  assert.doesNotMatch(html, />About<|>Apply</);
  for (const label of ["Company URL", "Work email", "Phone number"]) {
    assert.doesNotMatch(html, new RegExp(`>${label}<`));
  }
  assert.doesNotMatch(html, /codex-preview|Codex is working|react-loading-skeleton/i);
});

test("server-renders the standalone application route", async () => {
  const response = await render("/apply");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, />Put Mewtuals on your company’s side\.<\/h2>/);
  for (const label of ["Company URL", "Work email", "Phone number"]) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  assert.match(html, /href="\/#how-it-works">How it works<\/a>/);
  assert.match(html, /href="\/#for-startups">For startups<\/a>/);
  assert.match(html, /href="\/join">For creators<\/a>/);
  assert.match(html, /href="\/join">Join Mewtuals<\/a>/);
  assert.match(html, /href="\/login">Log in<\/a>/);
  assert.doesNotMatch(html, /href="#apply"/);
});

test("compiled mobile navigation stays reachable in short viewports", async () => {
  const css = await readCompiledStyles();

  assert.match(
    css,
    /@media \(width<=900px\).*?\.primary-navigation\{(?=[^}]*max-height:calc\(100dvh\s*-\s*var\(--header-height\)\))(?=[^}]*overflow-y:auto)[^}]*\}/s,
  );
});
