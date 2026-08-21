import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  buildGooglePatchSnapshot,
  parseGooglePatchScope,
  refreshGooglePatchScope,
} from "../src/rewards/programs/google-patch-rewards.mjs";
import { qualifyRewardProject, rankRewardProjects, scopeFreshness, validateRewardSnapshot, writeRewardSnapshot } from "../src/rewards/registry.mjs";
import { buildCandidateDossier, renderCandidateMarkdown } from "../src/rewards/candidate.mjs";
import { profileRewardRepository } from "../src/rewards/static-profile.mjs";

const execFileAsync = promisify(execFile);
const SCOPE_FIXTURE = `# Patch Rewards Program Scope

Last updated: 2026-08-01

## Tier 1

Package | Month Added | Area
--- | --- | ---
[parser-one](https://github.com/example/parser-one) | 8/2026 | Core infrastructure data parsers
[library-one](https://github.com/example/library-one) | 8/2026 | Other essential libraries

## Tier 2

- [Projects integrated into OSS-Fuzz](https://github.com/google/oss-fuzz/tree/master/projects)
`;

test("parses named projects and the OSS-Fuzz collection from official-format Markdown", () => {
  const parsed = parseGooglePatchScope(SCOPE_FIXTURE);
  assert.equal(parsed.projects.length, 3);
  assert.equal(parsed.projects.find((item) => item.name === "parser-one").tier, 1);
  assert.equal(parsed.projects.find((item) => item.tier === 2).kind, "collection");
});

test("refuses a malformed scope instead of replacing the registry", () => {
  assert.throws(() => parseGooglePatchScope("# empty"), /no named tier 1/i);
});

test("refresh fetches only the hard-coded official scope and records its digest", async () => {
  let requested = null;
  const snapshot = await refreshGooglePatchScope({
    retrievedAt: "2026-08-20T12:00:00.000Z",
    fetchImpl: async (url) => {
      requested = url;
      return { ok: true, text: async () => SCOPE_FIXTURE };
    },
  });
  assert.equal(requested, "https://raw.githubusercontent.com/google/bughunters/main/patch-rewards-program/scope.md");
  assert.match(snapshot.source.sha256, /^[a-f0-9]{64}$/);
});

test("registry writes ignore the former predictable temp path and never follow it", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "patch-lab-registry-write-"));
  const destination = path.join(root, "scope.json");
  const outside = path.join(root, "outside.txt");
  const formerTemporary = `${destination}.${process.pid}.tmp`;
  await writeFile(outside, "unchanged");
  await symlink(outside, formerTemporary);
  const snapshot = buildGooglePatchSnapshot(SCOPE_FIXTURE, { retrievedAt: "2026-08-20T12:00:00.000Z" });
  await writeRewardSnapshot(snapshot, destination);
  assert.equal(await readFile(outside, "utf8"), "unchanged");
  assert.equal(JSON.parse(await readFile(destination, "utf8")).schema, "patch-lab/reward-scope/v1");
});

test("rank shows policy ceilings without presenting them as expected revenue", () => {
  const snapshot = buildGooglePatchSnapshot(SCOPE_FIXTURE, { retrievedAt: "2026-08-20T12:00:00.000Z" });
  const ranked = rankRewardProjects(snapshot, { asOf: "2026-08-20" });
  const parser = ranked.find((item) => item.name === "parser-one");
  const library = ranked.find((item) => item.name === "library-one");
  assert.equal(parser.reward.policyCeilingUsd, 45_000);
  assert.equal(library.reward.policyCeilingUsd, 30_000);
  assert.match(parser.reward.boundary, /not prediction|unproved/i);
  assert.equal(parser.state, "unqualified");
});

test("registry validation rejects altered policy constants and project rows", () => {
  const snapshot = buildGooglePatchSnapshot(SCOPE_FIXTURE, { retrievedAt: "2026-08-20T12:00:00.000Z" });
  const alteredPolicy = structuredClone(snapshot);
  alteredPolicy.program.rewards[3].amountUsd = 999_999;
  assert.throws(() => validateRewardSnapshot(alteredPolicy), /policy constants/i);

  const alteredProject = structuredClone(snapshot);
  alteredProject.projects[0].name = "fabricated-winner";
  assert.throws(() => validateRewardSnapshot(alteredProject), /raw scope receipt/i);
});

test("scope freshness fails closed after seven days", () => {
  const snapshot = buildGooglePatchSnapshot(SCOPE_FIXTURE, { retrievedAt: "2026-08-01T12:00:00.000Z" });
  assert.equal(scopeFreshness(snapshot, "2026-08-05").state, "fresh");
  assert.equal(scopeFreshness(snapshot, "2026-08-20").state, "review-required");
  assert.equal(scopeFreshness(snapshot, "2026-10-01").state, "expired");
});

test("qualification verifies the official Git remote but leaves research and external gates blocked", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "patch-lab-reward-"));
  await execFileAsync("git", ["init", "-q", root]);
  await execFileAsync("git", ["-C", root, "remote", "add", "origin", "git@github.com:example/parser-one.git"]);
  await writeFile(path.join(root, "CMakeLists.txt"), "# build marker\n");
  await writeFile(path.join(root, "SECURITY.md"), "Report privately.\n");
  const snapshot = buildGooglePatchSnapshot(SCOPE_FIXTURE, { retrievedAt: "2026-08-20T12:00:00.000Z" });
  const qualification = await qualifyRewardProject({ snapshot, projectName: "parser-one", repositoryRoot: root, asOf: "2026-08-20" });
  assert.equal(qualification.status, "eligible-for-local-triage");
  assert.equal(qualification.gates.find((item) => item.id === "repository-match").state, "pass");
  assert.equal(qualification.gates.find((item) => item.id === "external-action").state, "blocked");
  assert.doesNotMatch(JSON.stringify(qualification), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("qualification blocks a different repository and candidate remains unsubmitted and unpaid", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "patch-lab-reward-mismatch-"));
  await mkdir(path.join(root, ".git"));
  const snapshot = buildGooglePatchSnapshot(SCOPE_FIXTURE, { retrievedAt: "2026-08-20T12:00:00.000Z" });
  const qualification = await qualifyRewardProject({ snapshot, projectName: "parser-one", repositoryRoot: root, asOf: "2026-08-20" });
  assert.equal(qualification.status, "blocked-before-triage");
  const candidate = buildCandidateDossier(qualification, { title: "Bounds hardening hypothesis" });
  assert.equal(candidate.submission, "not-authorized");
  assert.equal(candidate.payment, "not-earned");
  assert.match(renderCandidateMarkdown(candidate), /Policy ceiling only/);
});

test("qualification suppresses local filesystem remotes", async () => {
  const snapshot = buildGooglePatchSnapshot(SCOPE_FIXTURE, { retrievedAt: "2026-08-20T12:00:00.000Z" });
  const localPath = path.join(path.sep, "private", "secret", "repo.git");
  const localFileUrl = ["file:", "", "", "Users", "example", "private", "repo.git"].join("/");
  for (const remote of [localPath, localFileUrl]) {
    const root = await mkdtemp(path.join(os.tmpdir(), "patch-lab-reward-local-"));
    await execFileAsync("git", ["init", "-q", root]);
    await execFileAsync("git", ["-C", root, "remote", "add", "origin", remote]);
    const qualification = await qualifyRewardProject({ snapshot, projectName: "parser-one", repositoryRoot: root, asOf: "2026-08-20" });
    assert.equal(qualification.repository.remote, null);
    assert.equal(qualification.status, "blocked-before-triage");
    const serialized = JSON.stringify(qualification);
    assert.ok(!serialized.includes(path.join("private", "secret")));
    assert.ok(!serialized.includes(["Users", "example"].join("/")));
  }
});

test("candidate Markdown escapes a title instead of creating forged sections", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "patch-lab-reward-title-"));
  await execFileAsync("git", ["init", "-q", root]);
  await execFileAsync("git", ["-C", root, "remote", "add", "origin", "https://github.com/example/parser-one.git"]);
  const snapshot = buildGooglePatchSnapshot(SCOPE_FIXTURE, { retrievedAt: "2026-08-20T12:00:00.000Z" });
  const qualification = await qualifyRewardProject({ snapshot, projectName: "parser-one", repositoryRoot: root, asOf: "2026-08-20" });
  const candidate = buildCandidateDossier(qualification, { title: "Candidate\n## Paid $45,000" });
  const markdown = renderCandidateMarkdown(candidate);
  assert.doesNotMatch(markdown, /^## Paid/m);
  assert.ok(markdown.startsWith("# Candidate \\#\\# Paid \\$45\\,000"));
});

test("static profile produces bounded research leads without executing code or claiming vulnerabilities", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "patch-lab-reward-profile-"));
  await execFileAsync("git", ["init", "-q", root]);
  await execFileAsync("git", ["-C", root, "remote", "add", "origin", "https://github.com/example/parser-one.git"]);
  await writeFile(path.join(root, "SECURITY.md"), "Report privately.\n");
  await writeFile(path.join(root, "parser.c"), "void parse(char *in, int n) { char *p = malloc(n); memcpy(p, in, n); }\n");
  await writeFile(path.join(root, "fuzz_parser.c"), "int LLVMFuzzerTestOneInput(const char *d, int n) { parse(d, n); return 0; }\n");
  const snapshot = buildGooglePatchSnapshot(SCOPE_FIXTURE, { retrievedAt: "2026-08-20T12:00:00.000Z" });
  const qualification = await qualifyRewardProject({ snapshot, projectName: "parser-one", repositoryRoot: root, asOf: "2026-08-20" });
  const profile = await profileRewardRepository({ qualification, repositoryRoot: root });
  assert.equal(profile.state, "research-leads-only");
  assert.ok(profile.lexicalSignals["raw-copy"] > 0);
  assert.deepEqual(profile.fuzzHarnessFiles, ["fuzz_parser.c"]);
  assert.match(profile.limits.join(" "), /not vulnerabilities/i);
  assert.doesNotMatch(JSON.stringify(profile), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("project policy can block an otherwise in-scope AI-assisted contribution lane", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "patch-lab-reward-policy-"));
  await execFileAsync("git", ["init", "-q", root]);
  await execFileAsync("git", ["-C", root, "remote", "add", "origin", "https://github.com/example/parser-one.git"]);
  await mkdir(path.join(root, ".github"));
  await writeFile(path.join(root, ".github", "SECURITY.md"), "Security reports must originate from a human. Automatic reporting from a bot/agent account is strictly forbidden. This project does not accept contributions generated using AI.\n");
  const snapshot = buildGooglePatchSnapshot(SCOPE_FIXTURE, { retrievedAt: "2026-08-20T12:00:00.000Z" });
  const qualification = await qualifyRewardProject({ snapshot, projectName: "parser-one", repositoryRoot: root, asOf: "2026-08-20" });
  assert.equal(qualification.status, "blocked-before-triage");
  assert.equal(qualification.gates.find((item) => item.id === "ai-assisted-contribution-fit").state, "blocked");
  await assert.rejects(() => profileRewardRepository({ qualification, repositoryRoot: root }), /blocked/i);
});

test("qualification detects a private security email path stated before a public bug-tracker prohibition", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "patch-lab-reward-private-"));
  await execFileAsync("git", ["init", "-q", root]);
  await execFileAsync("git", ["-C", root, "remote", "add", "origin", "https://github.com/example/parser-one.git"]);
  await writeFile(path.join(root, "CONTRIBUTING.md"), "To report a security issue, including a crash caused by malformed input, send the complete details and reproducer to the project security email. Please include affected versions and platform information; do not use the\nbug tracker.\n");
  const snapshot = buildGooglePatchSnapshot(SCOPE_FIXTURE, { retrievedAt: "2026-08-20T12:00:00.000Z" });
  const qualification = await qualifyRewardProject({ snapshot, projectName: "parser-one", repositoryRoot: root, asOf: "2026-08-20" });
  assert.equal(qualification.repository.policySignals.privateDisclosureRequired, true);
});
