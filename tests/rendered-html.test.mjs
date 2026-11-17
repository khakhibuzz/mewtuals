import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
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

test("server-renders the sparse Physical AI landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Mewtuals — Partnerships for Physical AI companies<\/title>/);
  assert.match(
    html,
    /<a(?=[^>]*href="\/")(?=[^>]*aria-label="Mewtuals home")(?=[^>]*class="wordmark")[^>]*>/,
  );
  assert.match(html, /The External Partnerships function for Physical AI companies/);
  assert.match(html, /One partnership can change a company\./);
  assert.doesNotMatch(html, /One partnership can change a robotics company\./);
  assert.match(html, />We find the right one\.<\/strong>/);
  assert.match(html, /href="\/join">Find my next partnership<\/a>/);
  assert.match(html, /href="\/ecosystem">Explore the ecosystem<\/a>/);
  assert.match(html, /aria-label="Mewtuals at the centre of the Physical AI partnership ecosystem"/);
  assert.match(
    html,
    /<meta name="description" content="Mewtuals maps the Physical AI ecosystem and advances the right external partnerships from signal to pilot\."\/?>/,
  );
  for (const [label, href] of [
    ["Ecosystem", "/ecosystem"],
    ["For companies", "/companies"],
    ["Join Mewtuals", "/join"],
  ]) {
    assert.match(
      html,
      new RegExp(`<a(?=[^>]*href="${href}")[^>]*>${label}<\\/a>`),
    );
  }
  assert.doesNotMatch(html, />How it works<|>For startups<|>For creators<|>Log in</);
  assert.doesNotMatch(html, /id="how-it-works"|id="for-startups"|Illustrative case study/);
  assert.doesNotMatch(html, /codex-preview|Codex is working|react-loading-skeleton/i);
  assert.doesNotMatch(html, /<a\b[^>]*href="\/robotics-data(?:[/?#][^"]*)?"/);
  assert.doesNotMatch(html, /<a\b[^>]*href="\/factory-partners(?:[/?#][^"]*)?"/);
});

test("server-renders the unlisted robotics data landing page", async () => {
  const response = await render("/robotics-data");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Mewtuals Data — Real-world data for robotics<\/title>/);
  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(headings.length, 1);
  assert.equal(
    headings[0][1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
    "Real work. Better robot data.",
  );
  assert.match(
    html,
    /<meta\b(?=[^>]*name="robots")(?=[^>]*content="noindex,\s*nofollow")[^>]*>/,
  );
  const { document } = new JSDOM(html).window;
  for (const decoration of document.querySelectorAll('[aria-hidden="true"]')) {
    decoration.remove();
  }
  for (const label of ["Build your collection pilot", "Let’s talk"]) {
    const pilotLink = [...document.querySelectorAll("a")].find(
      (link) => link.textContent.replace(/\s+/g, " ").trim() === label,
    );
    assert.ok(pilotLink, `${label} must be server-rendered.`);
    assert.equal(pilotLink.getAttribute("href"), "#pilot");
  }
  const emailLink = document.querySelector('#pilot a[href^="mailto:"]');
  assert.ok(emailLink, "The pilot section must offer a direct email enquiry.");
  assert.equal(emailLink.textContent.trim(), "Discuss a data pilot");
  const emailUrl = new URL(emailLink.getAttribute("href"));
  assert.equal(emailUrl.pathname, "keshav@mewtuals.com");
  assert.equal(emailUrl.searchParams.get("subject"), "Robotics data collection pilot");
  assert.doesNotMatch(document.querySelector("#pilot")?.textContent ?? "", /reply to the person/);
  assert.equal(document.querySelector('a[href="/apply"]'), null);
});

test("serves a directly shareable factory partner page with a pilot contact", async () => {
  const response = await render("/factory-partners");
  assert.equal(response.status, 200);
  const { document } = new JSDOM(await response.text()).window;
  assert.equal(document.querySelector('meta[name="robots"]')?.content, "noindex, nofollow");
  const main = document.querySelector("main");
  assert.ok(main);
  assert.equal(main.querySelectorAll("h1").length, 1);
  assert.match(main.textContent, /stereo camera headset/i);
  assert.match(main.textContent, /consent from participating workers/i);
  assert.match(main.textContent, /IIT Ropar/);
  assert.ok(main.querySelector('a[href^="mailto:keshav@mewtuals.com?"]'));
  const whatsapp = main.querySelector('#contact a[href="https://wa.me/918872052031"]');
  assert.ok(whatsapp);
  assert.equal(whatsapp.getAttribute("aria-label"), "WhatsApp Keshav Garg at +91 8872052031");
  assert.ok(whatsapp.querySelector('svg[aria-hidden="true"]'));
  const linkedIn = main.querySelector('a[href="https://www.linkedin.com/in/keshav-garg/"]');
  assert.match(linkedIn?.textContent ?? "", /LinkedIn/);
  const outreach = document.querySelector("footer ul");
  assert.ok(outreach);
  assert.ok([...outreach.querySelectorAll("li")].some((item) => item.textContent.trim() === "Generalist"));
  assert.match(document.querySelector("footer")?.textContent ?? "", /outreach does not imply a partnership/i);
  assert.equal(main.querySelector('a[href="/apply"]'), null);
});

test("server-renders the standalone application route with the shared public header", async () => {
  const response = await render("/apply");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, />Put Mewtuals on your company’s side\.<\/h2>/);
  for (const label of ["Company URL", "Work email", "Phone number"]) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  for (const [label, href] of [
    ["Ecosystem", "/ecosystem"],
    ["For companies", "/companies"],
    ["Join Mewtuals", "/join"],
  ]) {
    assert.match(
      html,
      new RegExp(`<a(?=[^>]*href="${href}")[^>]*>${label}<\\/a>`),
    );
  }
  assert.doesNotMatch(html, />How it works<|>For startups<|>For creators<|>Log in</);
});

test("compiled mobile navigation stays reachable in short viewports", async () => {
  const css = await readCompiledStyles();
  assert.match(
    css,
    /@media \(width<=900px\).*?\.primary-navigation\{(?=[^}]*max-height:calc\(100dvh\s*-\s*var\(--header-height\)\))(?=[^}]*overflow-y:auto)[^}]*\}/s,
  );
});
