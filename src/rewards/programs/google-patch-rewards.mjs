import { createHash } from "node:crypto";

export const GOOGLE_PATCH_REWARDS = Object.freeze({
  id: "google-patch-rewards",
  title: "Google Open Source Security Patch Rewards",
  mode: "merged-security-patch",
  programUrl: "https://bughunters.google.com/open-source-security/patch-rewards",
  scopeUrl: "https://raw.githubusercontent.com/google/bughunters/main/patch-rewards-program/scope.md",
  policyCheckedAt: "2026-08-20",
  rewards: Object.freeze([
    { id: "small", label: "Smaller security improvement", amountUsd: 500 },
    { id: "modest", label: "Modest or speculative improvement", amountUsd: 2_000 },
    { id: "moderate", label: "Compelling, moderately complex improvement", amountUsd: 7_500 },
    { id: "high-impact", label: "Complicated, high-impact improvement", amountUsd: 15_000 },
  ]),
  multipliers: Object.freeze([
    {
      id: "tier1-memory-safety",
      multiplier: 2,
      endsOn: "2026-12-31",
      condition: "Qualifying secure-by-design memory-safety improvement in a tier 1 project",
    },
    {
      id: "tier1-parser-memory-safety",
      multiplier: 3,
      endsOn: "2026-12-31",
      condition: "Qualifying secure-by-design memory-safety improvement in a tier 1 core infrastructure data parser",
    },
  ]),
});

export function parseGooglePatchScope(markdown) {
  if (typeof markdown !== "string" || !markdown.trim()) throw new TypeError("Google scope content is empty.");
  const projects = [];
  let tier = null;
  const sourceUpdatedMatch = markdown.match(/^Last updated:\s*(\d{4}-\d{2}-\d{2})\s*$/mi);

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const tierMatch = line.match(/^##\s+Tier\s+(\d+)$/i);
    if (tierMatch) {
      tier = Number(tierMatch[1]);
      continue;
    }
    if (!tier) continue;

    const row = line.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/);
    if (row) {
      projects.push({
        name: row[1].trim(),
        url: row[2].trim(),
        tier,
        monthAdded: row[3].trim(),
        area: row[4].trim(),
        kind: "project",
      });
      continue;
    }

    const collection = line.match(/^-\s+\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*$/);
    if (collection) {
      projects.push({
        name: collection[1].trim(),
        url: collection[2].trim(),
        tier,
        monthAdded: null,
        area: "Collection defined by the official scope source",
        kind: "collection",
      });
    }
  }

  if (!projects.some((item) => item.tier === 1 && item.kind === "project")) {
    throw new Error("Google scope parser found no named tier 1 projects; refusing to replace the registry.");
  }
  if (!projects.some((item) => item.tier === 2 && item.kind === "collection")) {
    throw new Error("Google scope parser did not find the OSS-Fuzz tier 2 collection; refusing to replace the registry.");
  }

  return {
    sourceUpdatedAt: sourceUpdatedMatch?.[1] ?? null,
    projects: projects.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name)),
  };
}

export function buildGooglePatchSnapshot(markdown, { retrievedAt = new Date().toISOString() } = {}) {
  const parsed = parseGooglePatchScope(markdown);
  const sourceSha256 = createHash("sha256").update(markdown).digest("hex");
  return {
    schema: "patch-lab/reward-scope/v1",
    program: GOOGLE_PATCH_REWARDS,
    source: {
      url: GOOGLE_PATCH_REWARDS.scopeUrl,
      retrievedAt,
      publishedDateClaim: parsed.sourceUpdatedAt,
      sha256: sourceSha256,
      rawMarkdown: markdown,
    },
    projects: parsed.projects,
    limitations: [
      "A named project proves program scope only; it does not prove a proposed patch is eligible.",
      "Reward amounts and multipliers are published ceilings, not expected or earned revenue.",
      "The official program rules must be checked again before an external pull request or reward submission.",
    ],
  };
}

export async function refreshGooglePatchScope({ fetchImpl = globalThis.fetch, retrievedAt } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  const response = await fetchImpl(GOOGLE_PATCH_REWARDS.scopeUrl, {
    headers: { "User-Agent": "Patch-Lab-Reward-Radar/0.2" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Official Google scope fetch failed with HTTP ${response.status}.`);
  return buildGooglePatchSnapshot(await response.text(), { retrievedAt });
}
