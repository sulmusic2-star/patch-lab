import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanRepository } from "../src/core/scan.mjs";
import { hubspotPack } from "../src/packs/hubspot/index.mjs";
import { renderHtml } from "../src/render/html.mjs";
import { renderMarkdown } from "../src/render/markdown.mjs";

async function reportFor(source, { platformVersion = "2025.1" } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "patch-lab-render-"));
  await writeFile(path.join(root, "hsproject.json"), JSON.stringify({ name: "fixture", srcDir: "src", platformVersion }));
  await writeFile(path.join(root, "client.js"), source);
  return scanRepository({ root, pack: hubspotPack, asOf: "2026-08-20" });
}

test("Markdown is plain, bounded, and source-linked", async () => {
  const report = await reportFor('fetch("/crm/v4/objects/deals");');
  const markdown = renderMarkdown(report);
  assert.match(markdown, /Confirmed in source/);
  assert.match(markdown, /Needs manual review/);
  assert.match(markdown, /What this report does not prove/);
  assert.match(markdown, /developers\.hubspot\.com/);
  assert.doesNotMatch(markdown, /powered by AI|revolutionary|seamless|supercharge/i);
});

test("Markdown renders repository-controlled values as text, not document structure", async () => {
  const platformVersion = "x\n\n## Forged accepted\n\nPayment: $45,000\n![track](https://example.invalid/pixel)";
  const report = await reportFor('fetch("/crm/v4/objects/deals");', { platformVersion });
  report.repository = "repo\n## Forged repository";
  const markdown = renderMarkdown(report);
  assert.doesNotMatch(markdown, /^## Forged/m);
  assert.doesNotMatch(markdown, /^Payment:/m);
  assert.doesNotMatch(markdown, /!\[track\]\(/);
  assert.match(markdown, /HubSpot platform version is unrecognized/);
});

test("reports suppress source-line credentials while preserving detector evidence", async () => {
  const aws = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
  const report = await reportFor(`const credential = "${aws}"; fetch("/crm/v4/objects/deals");`);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, new RegExp(aws));
  assert.match(serialized, /CRM v4 path detected/);
});

test("HTML escapes repository source and includes the report design safeguards", async () => {
  const report = await reportFor('fetch("/crm/v4/<script>alert(1)</script>");');
  const html = await renderHtml(report);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'none'/);
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
  assert.match(html, /overflow-x: clip/);
  assert.doesNotMatch(html, /width:\s*100vw|transition-all|linear-gradient|background-clip:\s*text/);
  assert.match(html, /What this report does not prove/);
});

test("HTML uses the report fingerprint and no absolute repository path", async () => {
  const report = await reportFor('fetch("/crm/v3/objects/deals");');
  const html = await renderHtml(report);
  assert.match(html, new RegExp(report.fingerprint.slice(0, 16)));
  assert.ok(!html.includes(report.root ?? "__missing__"));
});
