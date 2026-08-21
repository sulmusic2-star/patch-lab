import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanRepository } from "../src/core/scan.mjs";
import { hubspotPack } from "../src/packs/hubspot/index.mjs";
import { redactText } from "../src/core/redact.mjs";
import { collectTextFiles } from "../src/core/files.mjs";
import { writeTextOutput } from "../src/core/output.mjs";

async function fixture() {
  return mkdtemp(path.join(os.tmpdir(), "patch-lab-core-"));
}

test("fingerprint is deterministic and report omits the absolute repository path", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "hsproject.json"), JSON.stringify({ name: "fixture", srcDir: "src", platformVersion: "2025.1" }));
  const first = await scanRepository({ root, pack: hubspotPack, asOf: "2026-08-20" });
  const second = await scanRepository({ root, pack: hubspotPack, asOf: "2026-08-20" });
  assert.equal(first.fingerprint, second.fingerprint);
  assert.doesNotMatch(JSON.stringify(first), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(first.repository, path.basename(root));
});

test("collector does not follow symlinks", async () => {
  const root = await fixture();
  const outside = await fixture();
  await writeFile(path.join(root, "hsproject.json"), JSON.stringify({ name: "fixture", srcDir: "src", platformVersion: "2026.03" }));
  await writeFile(path.join(outside, "leak.js"), 'fetch("/crm/v4/objects");');
  await symlink(path.join(outside, "leak.js"), path.join(root, "leak.js"));
  const report = await scanRepository({ root, pack: hubspotPack, asOf: "2026-08-20" });
  assert.ok(!report.findings.some((item) => item.policyId === "HS_API_V4"));
});

test("redactor removes common tokens, assignments, and repository paths", () => {
  const root = "/private/repository";
  const hubspotToken = ["pat", "na1", "secretsecret"].join("-");
  const bearer = ["Bearer", "abcdefghijklmnop"].join(" ");
  const text = `${root}/file.js PRIVATE_APP_TOKEN=${hubspotToken} ${bearer}`;
  const redacted = redactText(text, { root });
  assert.doesNotMatch(redacted, /private\/repository|secretsecret|abcdefghijklmnop/);
  assert.match(redacted, /\[REPOSITORY\]|\[REDACTED/);
});

test("redactor covers common provider, basic-auth, URL, and mixed-case key shapes", () => {
  const aws = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
  const google = ["AIza", "abcdefghijklmnopqrstuvwxyz123456789"].join("");
  const gitlab = ["glpat", "abcdefghijklmnopqrstuvwxyz"].join("-");
  const basic = ["Basic", "dXNlcjpwYXNzd29yZA=="].join(" ");
  const text = `${aws} ${google} ${gitlab} ${basic} apiKey="mixedCaseValue" https://user:password@example.com/x?token=querySecret`;
  const redacted = redactText(text);
  assert.doesNotMatch(redacted, /AKIA|AIza|glpat-|dXNlcjpwYXNzd29yZA|mixedCaseValue|password@example|querySecret/);
});

test("binary-looking and oversized files are counted instead of parsed", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "binary.js"), Buffer.from([0, 1, 2, 3]));
  await writeFile(path.join(root, "src", "large.js"), "x".repeat(1_000_001));
  const report = await scanRepository({ root, pack: hubspotPack, asOf: "2026-08-20" });
  assert.equal(report.inventory.skippedBinaryFiles, 1);
  assert.equal(report.inventory.skippedLargeFiles, 1);
});

test("collector fails closed at the cumulative text byte budget", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "one.js"), "123456");
  await writeFile(path.join(root, "two.js"), "abcdef");
  await assert.rejects(
    () => collectTextFiles(root, { extensions: [".js"], maxFileBytes: 10, maxTotalBytes: 10 }),
    /cumulative limit/i,
  );
});

test("atomic output rejects a symlink and preserves its target", async () => {
  const root = await fixture();
  const outside = await fixture();
  const target = path.join(outside, "target.txt");
  await writeFile(target, "unchanged");
  await symlink(target, path.join(root, "report.md"));
  await assert.rejects(() => writeTextOutput("report.md", "forged", { cwd: root }), /regular file/i);
  assert.equal(await readFile(target, "utf8"), "unchanged");
});

test("atomic output creates and safely replaces a regular file", async () => {
  const root = await fixture();
  await writeTextOutput("report.md", "first", { cwd: root });
  await writeTextOutput("report.md", "second", { cwd: root });
  assert.equal(await readFile(path.join(root, "report.md"), "utf8"), "second");
});
