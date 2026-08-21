import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";

import { writeTextOutput } from "../core/output.mjs";
import { GOOGLE_PATCH_REWARDS, parseGooglePatchScope } from "./programs/google-patch-rewards.mjs";

const execFileAsync = promisify(execFile);
const DAY_MS = 86_400_000;
const BUILD_MARKERS = new Set([
  "BUILD", "BUILD.bazel", "CMakeLists.txt", "Cargo.toml", "Makefile", "WORKSPACE", "configure",
  "go.mod", "meson.build", "package.json", "pom.xml", "pyproject.toml", "setup.py",
]);
const GUIDANCE_CANDIDATES = [
  "SECURITY.md", "SECURITY.txt", "CONTRIBUTING", "CONTRIBUTING.md",
  ".github/SECURITY.md", ".github/CONTRIBUTING.md", "docs/SECURITY.md",
];

export async function writeRewardSnapshot(snapshot, destination) {
  const absolute = path.resolve(destination);
  await writeTextOutput(absolute, `${JSON.stringify(snapshot, null, 2)}\n`);
  return absolute;
}

export function validateRewardSnapshot(parsed, { now = Date.now() } = {}) {
  if (parsed?.schema !== "patch-lab/reward-scope/v1") throw new Error("Unsupported reward-scope schema.");
  if (!isDeepStrictEqual(parsed.program, GOOGLE_PATCH_REWARDS)) throw new Error("Reward snapshot policy constants do not match the compiled Google policy.");
  if (!Array.isArray(parsed.projects) || !parsed.projects.length) throw new Error("Reward snapshot has no projects.");
  if (parsed.source?.url !== GOOGLE_PATCH_REWARDS.scopeUrl) throw new Error("Reward snapshot does not use the compiled official scope URL.");
  if (!/^[a-f0-9]{64}$/.test(String(parsed.source?.sha256 ?? ""))) throw new Error("Reward snapshot has an invalid source digest.");
  const retrievedAt = new Date(parsed.source?.retrievedAt);
  if (!Number.isFinite(retrievedAt.getTime()) || retrievedAt.getTime() > now + 5 * 60_000) throw new Error("Reward snapshot has an invalid or future retrieval time.");
  const rawMarkdown = parsed.source?.rawMarkdown;
  if (typeof rawMarkdown !== "string" || !rawMarkdown.trim() || Buffer.byteLength(rawMarkdown, "utf8") > 2_000_000) {
    throw new Error("Reward snapshot does not contain a bounded raw scope receipt.");
  }
  const digest = createHash("sha256").update(rawMarkdown).digest("hex");
  if (digest !== parsed.source.sha256) throw new Error("Reward snapshot raw scope does not match its source digest.");
  const reparsed = parseGooglePatchScope(rawMarkdown);
  if (parsed.source.publishedDateClaim !== reparsed.sourceUpdatedAt || !isDeepStrictEqual(parsed.projects, reparsed.projects)) {
    throw new Error("Reward snapshot projects do not match the saved raw scope receipt.");
  }
  return parsed;
}

export async function loadRewardSnapshot(source) {
  return validateRewardSnapshot(JSON.parse(await readFile(source, "utf8")));
}

export function scopeFreshness(snapshot, asOf = new Date().toISOString().slice(0, 10)) {
  const retrieved = new Date(snapshot.source.retrievedAt);
  const comparison = new Date(`${asOf}T23:59:59.999Z`);
  if (!Number.isFinite(retrieved.getTime()) || !Number.isFinite(comparison.getTime())) throw new Error("Invalid scope freshness date.");
  const ageDays = Math.max(0, Math.floor((comparison - retrieved) / DAY_MS));
  return {
    ageDays,
    state: ageDays <= 7 ? "fresh" : ageDays <= 30 ? "review-required" : "expired",
  };
}

function rewardCeiling(snapshot, project, asOf) {
  const base = Math.max(...snapshot.program.rewards.map((item) => item.amountUsd));
  const active = snapshot.program.multipliers.filter((item) => asOf <= item.endsOn);
  let multiplier = 1;
  let multiplierId = null;
  if (project.tier === 1) {
    const parser = active.find((item) => item.id === "tier1-parser-memory-safety");
    const general = active.find((item) => item.id === "tier1-memory-safety");
    if (/core infrastructure data parsers/i.test(project.area) && parser) {
      multiplier = parser.multiplier;
      multiplierId = parser.id;
    } else if (general) {
      multiplier = general.multiplier;
      multiplierId = general.id;
    }
  }
  return {
    baseMaximumUsd: base,
    possibleMultiplier: multiplier,
    policyCeilingUsd: base * multiplier,
    multiplierId,
    boundary: "Policy ceiling only; eligibility, merger and reward remain unproved.",
  };
}

function directSourceScore(project) {
  try {
    const host = new URL(project.url).hostname;
    return new Set(["github.com", "gitlab.com", "gitlab.gnome.org", "gitlab.xiph.org", "salsa.debian.org"]).has(host) ? 10 : 0;
  } catch {
    return 0;
  }
}

export function rankRewardProjects(snapshot, { asOf = new Date().toISOString().slice(0, 10), tier } = {}) {
  validateRewardSnapshot(snapshot);
  return snapshot.projects
    .filter((project) => tier === undefined || project.tier === Number(tier))
    .map((project) => {
      const ceiling = rewardCeiling(snapshot, project, asOf);
      const score = (project.tier === 1 ? 40 : 15)
        + (ceiling.possibleMultiplier === 3 ? 35 : ceiling.possibleMultiplier === 2 ? 20 : 0)
        + directSourceScore(project)
        + (project.kind === "project" ? 5 : 0);
      return {
        ...project,
        priorityScore: score,
        reward: ceiling,
        state: "unqualified",
        nextGate: "Confirm the canonical repository, disclosure policy, duplicate status, local reproduction and maintainer acceptance path.",
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || a.name.localeCompare(b.name));
}

function normalizedRepositoryUrl(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const scp = raw.match(/^[^@/\s]+@([^:/\s]+):(.+)$/);
  let url;
  try {
    url = scp ? new URL(`ssh://${scp[1]}/${scp[2]}`) : new URL(raw);
  } catch {
    return null;
  }
  if (!new Set(["https:", "http:", "ssh:", "git:"]).has(url.protocol) || !url.hostname) return null;
  const repositoryPath = url.pathname.replace(/\.git$/, "").replace(/\/$/, "");
  if (!repositoryPath || repositoryPath === "/") return null;
  return `${url.hostname.toLowerCase()}${repositoryPath}`.toLowerCase();
}

async function repositoryMetadata(root) {
  const absolute = path.resolve(root);
  const rootInfo = await lstat(absolute);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error("Reward qualification requires a non-symlink repository directory.");
  const entries = await readdir(absolute, { withFileTypes: true });
  let rawRemote = null;
  try {
    const result = await execFileAsync("git", ["-C", absolute, "config", "--get", "remote.origin.url"], {
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    rawRemote = result.stdout.trim() || null;
  } catch {
    rawRemote = null;
  }
  const files = entries.filter((entry) => entry.isFile() && !entry.isSymbolicLink()).map((entry) => entry.name);
  const guidanceFiles = [];
  const guidanceText = [];
  for (const candidate of GUIDANCE_CANDIDATES) {
    try {
      const info = await lstat(path.join(absolute, candidate));
      if (info.isFile() && !info.isSymbolicLink() && info.size <= 1_000_000) {
        const content = await readFile(path.join(absolute, candidate), "utf8");
        if (/security|vulnerab|pull request|contribut|\bAI\b|bot\/agent/i.test(content)) {
          guidanceFiles.push(candidate);
          guidanceText.push(content);
        }
      }
    } catch {
      // Missing conventional policy paths are represented by an empty list.
    }
  }
  const joinedGuidance = guidanceText.join("\n");
  return {
    label: path.basename(absolute),
    remote: normalizedRepositoryUrl(rawRemote),
    buildMarkers: files.filter((name) => BUILD_MARKERS.has(name)).sort(),
    securityPolicyFiles: guidanceFiles.sort(),
    policySignals: {
      privateDisclosureRequired: /report(?:ed)?\s+(?:it\s+)?privately|do not disclose\s+(?:it\s+)?as a public|(?:to report a )?security issue[\s\S]{0,500}do not use\s+the\s+bug tracker/i.test(joinedGuidance),
      aiGeneratedContributionsForbidden: /does not accept[\s\S]{0,180}generated[\s\S]{0,80}\bAI\b|no code or other content[\s\S]{0,180}generated[\s\S]{0,80}\bAI\b/i.test(joinedGuidance),
      automatedReportsForbidden: /automatic reporting[\s\S]{0,100}(?:forbidden|banned)|bot\/agent account[\s\S]{0,100}(?:forbidden|banned)/i.test(joinedGuidance),
      unsolicitedPullRequestsForbidden: /does not allow unsolicited pull requests/i.test(joinedGuidance),
    },
  };
}

export async function qualifyRewardProject({ snapshot, projectName, repositoryRoot, asOf = new Date().toISOString().slice(0, 10) }) {
  validateRewardSnapshot(snapshot);
  const project = snapshot.projects.find((item) => item.name.toLowerCase() === String(projectName).toLowerCase());
  if (!project) throw new Error(`Project is not named in this snapshot: ${projectName}`);
  if (project.kind !== "project") throw new Error("A collection cannot qualify a repository without resolving a named member first.");
  const metadata = await repositoryMetadata(repositoryRoot);
  const freshness = scopeFreshness(snapshot, asOf);
  const expectedRemote = normalizedRepositoryUrl(project.url);
  const observedRemote = metadata.remote;
  const repositoryMatch = Boolean(expectedRemote && observedRemote && expectedRemote === observedRemote);
  const sourceHost = (() => { try { return new URL(project.url).hostname; } catch { return null; } })();
  const canonicalDirect = new Set(["github.com", "gitlab.com", "gitlab.gnome.org", "gitlab.xiph.org", "salsa.debian.org"]).has(sourceHost);
  const gates = [
    { id: "official-scope", state: "pass", evidence: `${project.name} is named as tier ${project.tier} in the saved official scope.` },
    { id: "scope-freshness", state: freshness.state === "fresh" ? "pass" : "blocked", evidence: `Official scope retrieved ${freshness.ageDays} day(s) before the as-of date.` },
    {
      id: "repository-match",
      state: repositoryMatch ? "pass" : canonicalDirect ? "blocked" : "unresolved",
      evidence: repositoryMatch ? "Git remote matches the official project URL." : "The local Git remote is not confirmed as the official project source.",
    },
    { id: "disclosure-policy", state: metadata.securityPolicyFiles.length ? "unresolved" : "blocked", evidence: metadata.securityPolicyFiles.length ? `Security or contribution guidance found: ${metadata.securityPolicyFiles.join(", ")}; it still requires human review.` : "No conventional security or contribution guidance was found." },
    {
      id: "ai-assisted-contribution-fit",
      state: metadata.policySignals.aiGeneratedContributionsForbidden || metadata.policySignals.automatedReportsForbidden ? "blocked" : "pass",
      evidence: metadata.policySignals.aiGeneratedContributionsForbidden || metadata.policySignals.automatedReportsForbidden
        ? "Discovered project guidance forbids AI-generated contributions or automated security reports."
        : "No explicit AI-contribution or automated-report prohibition was detected in the discovered guidance; human policy review remains required.",
    },
    { id: "duplicate-search", state: "blocked", evidence: "No equivalent issue, pull request, commit or private report search has been completed." },
    { id: "local-reproduction", state: "blocked", evidence: "No security hypothesis has been reproduced locally." },
    { id: "regression-proof", state: "blocked", evidence: "No failing-before and passing-after regression test exists." },
    { id: "external-action", state: "blocked", evidence: "No pull request, disclosure or reward submission is authorized." },
  ];
  const canTriageLocally = gates.filter((item) => ["official-scope", "scope-freshness", "repository-match", "ai-assisted-contribution-fit"].includes(item.id)).every((item) => item.state === "pass");
  return {
    schema: "patch-lab/reward-qualification/v1",
    program: { id: snapshot.program.id, title: snapshot.program.title },
    policySource: { ...snapshot.source },
    asOf,
    repository: metadata,
    project,
    reward: rewardCeiling(snapshot, project, asOf),
    status: canTriageLocally ? "eligible-for-local-triage" : "blocked-before-triage",
    gates,
    limits: [
      "Qualification does not establish a vulnerability, eligible patch, maintainer acceptance, reward or payment.",
      "Patch Lab has not executed repository code or tested a live service.",
    ],
  };
}
