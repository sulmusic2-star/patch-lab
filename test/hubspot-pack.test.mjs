import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { scanRepository } from "../src/core/scan.mjs";
import { hubspotPack } from "../src/packs/hubspot/index.mjs";

const execFileAsync = promisify(execFile);

async function makeRepo(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), "patch-lab-hubspot-"));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return root;
}

async function scan(files, asOf = "2026-08-20") {
  const root = await makeRepo(files);
  return scanRepository({ root, pack: hubspotPack, asOf });
}

test("classifies platform versions without claiming an outage", async () => {
  const report = await scan({
    "hsproject.json": JSON.stringify({ name: "fixture", srcDir: "src", platformVersion: "2025.1" }),
  });
  const item = report.findings.find((finding) => finding.policyId === "HS_PLATFORM_2025_1");
  assert.equal(item?.severity, "critical");
  assert.match(item?.meaning ?? "", /does not prove the running app is down/i);
  assert.equal(item?.deadline, "2026-08-01");
});

test("keeps 2025.2 planned and recognizes 2026.03 as current", async () => {
  const planned = await scan({
    "hsproject.json": JSON.stringify({ name: "fixture", srcDir: "src", platformVersion: "2025.2" }),
  });
  assert.equal(planned.findings.find((item) => item.policyId === "HS_PLATFORM_2025_2")?.severity, "medium");
  const current = await scan({
    "hsproject.json": JSON.stringify({ name: "fixture", srcDir: "src", platformVersion: "2026.03" }),
  });
  assert.ok(!current.findings.some((item) => item.policyId.startsWith("HS_PLATFORM_")));
});

test("does not confuse an app manifest named hsproject.json with a project root", async () => {
  const report = await scan({
    "src/app/hsproject.json": JSON.stringify({ uid: "app", auth: { requiredScopes: [] } }),
  });
  assert.ok(!report.findings.some((item) => item.policyId === "HS_PLATFORM_UNKNOWN"));
});

test("inventories beta, v4, v3, and legacy card paths with distinct claim boundaries", async () => {
  const report = await scan({
    "client.js": [
      'fetch("/crm/objects/2026-09-beta/deals");',
      'fetch("/crm/v4/objects/deals");',
      'fetch("/crm/v3/objects/deals");',
      'fetch("/crm/v3/extensions/cards/123");',
    ].join("\n"),
  });
  const ids = new Set(report.findings.map((item) => item.policyId));
  assert.ok(ids.has("HS_API_BETA_PIN"));
  assert.ok(ids.has("HS_API_V4"));
  assert.ok(ids.has("HS_API_V3_INVENTORY"));
  assert.ok(ids.has("HS_LEGACY_CRM_CARD"));
  assert.equal(report.findings.find((item) => item.policyId === "HS_API_V3_INVENTORY")?.confidence, "review-required");
});

test("ignores API paths that appear only in comments", async () => {
  const report = await scan({
    "client.js": [
      "// HubSpot uses /crm/v3/ in another service.",
      "/* old example: /crm/v4/objects/deals */",
      "const url = 'https://api.hubapi.com/crm/v3/objects/deals';",
    ].join("\n"),
  });
  assert.equal(report.findings.filter((item) => item.policyId === "HS_API_V3_INVENTORY").length, 1);
  assert.ok(!report.findings.some((item) => item.policyId === "HS_API_V4"));
});

test("labels test-only API evidence and does not present it as live use", async () => {
  const report = await scan({
    "test/client.test.js": 'expect("/crm/v4/objects/deals").toBeDefined();',
  });
  const item = report.findings.find((finding) => finding.policyId === "HS_API_V4");
  assert.equal(item?.severity, "review");
  assert.equal(item?.confidence, "review-required");
  assert.equal(item?.evidence.scope, "test-or-example");
  assert.match(item?.meaning ?? "", /does not prove the running integration uses/i);
});

test("2026-09 write review fires only when handling is not visible", async () => {
  const missing = await scan({
    "write.js": 'fetch("/crm/objects/2026-09/deals", { method: "POST" });',
  });
  assert.ok(missing.findings.some((item) => item.policyId === "HS_2026_09_WRITE_HANDLING"));
  const handled = await scan({
    "write.js": 'const response = await fetch("/crm/objects/2026-09/deals", { method: "POST" }); if (response.status === 400) handle(); const { warnings } = await response.json();',
  });
  assert.ok(!handled.findings.some((item) => item.policyId === "HS_2026_09_WRITE_HANDLING"));
  const semantic = await scan({
    "write.js": 'fetch("/crm/v3/objects/deals", { method: "POST" });',
  });
  assert.ok(!semantic.findings.some((item) => item.policyId === "HS_2026_09_WRITE_HANDLING"));
});

test("pipeline delete review respects an explicit reference policy", async () => {
  const missing = await scan({
    "pipeline.js": 'fetch("/crm/pipelines/2026-09/deals/one", { method: "DELETE" });',
  });
  assert.ok(missing.findings.some((item) => item.policyId === "HS_2026_09_PIPELINE_DELETE"));
  const explicit = await scan({
    "pipeline.js": 'fetch("/crm/pipelines/2026-09/deals/one?validateReferencesBeforeDelete=true", { method: "DELETE" });',
  });
  assert.ok(!explicit.findings.some((item) => item.policyId === "HS_2026_09_PIPELINE_DELETE"));
});

test("serverless migration finding suppresses environment values and deduplicates old layout", async () => {
  const privateToken = ["do", "not", "print"].join("-");
  const report = await scan({
    "hsproject.json": JSON.stringify({ name: "fixture", srcDir: "src", platformVersion: "2025.1" }),
    "serverless.json": JSON.stringify({ environment: { PRIVATE_TOKEN: privateToken } }),
    "src/app/app.functions/one.js": "export function main() {}",
    "src/app/app.functions/two.js": "export function main() {}",
  });
  assert.equal(report.findings.filter((item) => item.policyId === "HS_SERVERLESS_LAYOUT_MIGRATION").length, 1);
  assert.ok(report.findings.some((item) => item.policyId === "HS_SERVERLESS_ENV_MIGRATION"));
  assert.ok(!JSON.stringify(report).includes(privateToken));
});

test("tracked environment finding runs only when Git confirms tracking", async () => {
  const key = ["PRIVATE_APP_ACCESS", "TOKEN"].join("_");
  const secret = ["pat", "na1", "supersecretvalue"].join("-");
  const root = await makeRepo({ ".env": `${key}=${secret}\n` });
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await execFileAsync("git", ["add", ".env"], { cwd: root });
  const report = await scanRepository({ root, pack: hubspotPack, asOf: "2026-08-20" });
  assert.ok(report.findings.some((item) => item.policyId === "REPOSITORY_TRACKED_ENV"));
  assert.ok(!JSON.stringify(report).includes(secret));
  assert.ok(!JSON.stringify(report).includes(key));
});

test("tracked environment variants are covered while example templates are not", async () => {
  const key = ["HAPI", "KEY"].join("");
  const productionValue = ["private", "production", "value"].join("-");
  const exampleValue = ["replace", "me"].join("-");
  const root = await makeRepo({
    ".env.production": `${key}=${productionValue}\n`,
    ".env.example": `${key}=${exampleValue}\n`,
  });
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await execFileAsync("git", ["add", ".env.production", ".env.example"], { cwd: root });
  const report = await scanRepository({ root, pack: hubspotPack, asOf: "2026-08-20" });
  assert.equal(report.findings.filter((item) => item.policyId === "REPOSITORY_TRACKED_ENV").length, 1);
  assert.equal(report.findings.find((item) => item.policyId === "REPOSITORY_TRACKED_ENV")?.evidence.file, ".env.production");
  assert.ok(!JSON.stringify(report).includes(productionValue));
  assert.ok(!JSON.stringify(report).includes(exampleValue));
});

test("tracked-file checks work when scanning a nested project directory", async () => {
  const key = ["HAPI", "KEY"].join("");
  const secret = ["nested", "private", "value"].join("-");
  const root = await makeRepo({ "packages/hubspot/.env.local": `${key}=${secret}\n` });
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await execFileAsync("git", ["add", "packages/hubspot/.env.local"], { cwd: root });
  const nested = path.join(root, "packages", "hubspot");
  const report = await scanRepository({ root: nested, pack: hubspotPack, asOf: "2026-08-20" });
  assert.equal(report.findings.find((item) => item.policyId === "REPOSITORY_TRACKED_ENV")?.evidence.file, ".env.local");
  assert.ok(!JSON.stringify(report).includes(secret));
});

test("old declared HubSpot CLI is identified as a recommended-version issue", async () => {
  const report = await scan({
    "package.json": JSON.stringify({ devDependencies: { "@hubspot/cli": "^8.3.0" } }),
  });
  const item = report.findings.find((finding) => finding.policyId === "HS_CLI_OLD_FOR_MIGRATION");
  assert.equal(item?.severity, "medium");
  assert.match(item?.meaning ?? "", /recommends CLI 8\.4\.0/);
});
