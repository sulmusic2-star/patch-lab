#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { scanRepository } from "./core/scan.mjs";
import { writeTextOutput } from "./core/output.mjs";
import { hubspotPack } from "./packs/hubspot/index.mjs";
import { renderHtml } from "./render/html.mjs";
import { renderMarkdown } from "./render/markdown.mjs";
import { buildCandidateDossier, renderCandidateMarkdown } from "./rewards/candidate.mjs";
import { refreshGooglePatchScope } from "./rewards/programs/google-patch-rewards.mjs";
import {
  loadRewardSnapshot,
  qualifyRewardProject,
  rankRewardProjects,
  scopeFreshness,
  writeRewardSnapshot,
} from "./rewards/registry.mjs";
import { profileRewardRepository } from "./rewards/static-profile.mjs";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REWARD_SNAPSHOT = path.join(APP_ROOT, "data", "rewards", "google-patch-rewards.json");

const PACKS = new Map([
  ["hubspot", hubspotPack],
  [hubspotPack.id, hubspotPack],
]);

function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      positionals.push(item);
      continue;
    }
    const [name, inline] = item.slice(2).split("=", 2);
    if (inline !== undefined) flags[name] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) flags[name] = argv[++index];
    else flags[name] = true;
  }
  return { positionals, flags };
}

function usage() {
  return [
    "Patch Lab — deterministic repository evidence packs",
    "",
    "Usage:",
    "  patchlab list-packs",
    "  patchlab explain <policy-id> [--pack hubspot]",
    "  patchlab scan <repository> [--pack hubspot] [--format json|markdown|html] [--as-of YYYY-MM-DD] [--output file]",
    "  patchlab rewards refresh [--registry file]",
    "  patchlab rewards list [--tier 1|2] [--limit number] [--registry file]",
    "  patchlab rewards rank [--tier 1|2] [--limit number] [--as-of YYYY-MM-DD] [--registry file]",
    "  patchlab rewards qualify <repository> --project <official-name> [--output file]",
    "  patchlab rewards profile <repository> --project <official-name> [--output file]",
    "  patchlab rewards candidate <repository> --project <official-name> [--title text] [--format json|markdown] [--output file]",
    "",
    "Scans and reward qualification are read-only. Patch Lab does not execute target code, probe live services, publish, disclose, submit, or claim rewards.",
  ].join("\n");
}

async function emitOutput(output, flags) {
  if (flags.output) {
    const destination = await writeTextOutput(String(flags.output), output);
    process.stdout.write(`${destination}\n`);
    return;
  }
  process.stdout.write(output);
}

function rewardRows(items) {
  const lines = ["score\ttier\tceiling\tproject\tarea"];
  for (const item of items) {
    lines.push(`${item.priorityScore}\t${item.tier}\t$${item.reward.policyCeilingUsd}\t${item.name}\t${item.area}`);
  }
  return `${lines.join("\n")}\n`;
}

async function rewardsCommand(positionals, flags) {
  const subcommand = positionals[1];
  const registryPath = path.resolve(String(flags.registry ?? DEFAULT_REWARD_SNAPSHOT));
  if (!subcommand) throw new Error("A rewards subcommand is required.");

  if (subcommand === "refresh") {
    if (flags.program && flags.program !== "google-patch-rewards") throw new Error(`Unsupported reward program: ${flags.program}`);
    const snapshot = await refreshGooglePatchScope();
    const destination = await writeRewardSnapshot(snapshot, registryPath);
    process.stdout.write(`${destination}\n`);
    process.stdout.write(`projects\t${snapshot.projects.filter((item) => item.kind === "project").length}\n`);
    process.stdout.write(`source_sha256\t${snapshot.source.sha256}\n`);
    return 0;
  }

  const snapshot = await loadRewardSnapshot(registryPath);
  const asOf = String(flags["as-of"] ?? new Date().toISOString().slice(0, 10));
  const tier = flags.tier === undefined ? undefined : Number(flags.tier);
  if (tier !== undefined && !new Set([1, 2]).has(tier)) throw new Error("Tier must be 1 or 2.");
  const limit = flags.limit === undefined ? 25 : Number(flags.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Limit must be an integer from 1 to 500.");

  if (subcommand === "list" || subcommand === "rank") {
    const ranked = rankRewardProjects(snapshot, { asOf, tier }).slice(0, limit);
    const freshness = scopeFreshness(snapshot, asOf);
    if (flags.format === "json") {
      await emitOutput(`${JSON.stringify({ program: snapshot.program, source: snapshot.source, freshness, projects: ranked }, null, 2)}\n`, flags);
    } else {
      await emitOutput(`# ${snapshot.program.title}\nsource_age_days\t${freshness.ageDays}\nsource_state\t${freshness.state}\n${rewardRows(ranked)}`, flags);
    }
    return freshness.state === "fresh" ? 0 : 1;
  }

  const repositoryRoot = positionals[2];
  if (!repositoryRoot) throw new Error("A local repository directory is required.");
  if (!flags.project || flags.project === true) throw new Error("--project must be the exact official project name.");
  const qualification = await qualifyRewardProject({
    snapshot,
    projectName: String(flags.project),
    repositoryRoot,
    asOf,
  });

  if (subcommand === "qualify") {
    await emitOutput(`${JSON.stringify(qualification, null, 2)}\n`, flags);
    return qualification.status === "eligible-for-local-triage" ? 0 : 1;
  }
  if (subcommand === "profile") {
    const profile = await profileRewardRepository({ qualification, repositoryRoot });
    await emitOutput(`${JSON.stringify(profile, null, 2)}\n`, flags);
    return 0;
  }
  if (subcommand === "candidate") {
    const candidate = buildCandidateDossier(qualification, {
      title: typeof flags.title === "string" ? flags.title : undefined,
    });
    const format = String(flags.format ?? "markdown");
    if (!new Set(["json", "markdown"]).has(format)) throw new Error(`Unknown candidate format: ${format}`);
    await emitOutput(format === "json" ? `${JSON.stringify(candidate, null, 2)}\n` : renderCandidateMarkdown(candidate), flags);
    return qualification.status === "eligible-for-local-triage" ? 0 : 1;
  }
  throw new Error(`Unknown rewards subcommand: ${subcommand}`);
}

async function main(argv = process.argv.slice(2)) {
  const { positionals, flags } = parseArgs(argv);
  const command = positionals[0];
  if (!command || flags.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (command === "list-packs") {
    process.stdout.write(`${hubspotPack.id}\t${hubspotPack.title}\tpolicy ${hubspotPack.policyVersion}\n`);
    return 0;
  }
  if (command === "rewards") return rewardsCommand(positionals, flags);
  const pack = PACKS.get(String(flags.pack ?? "hubspot"));
  if (!pack) throw new Error(`Unknown policy pack: ${flags.pack}`);
  if (command === "explain") {
    const id = positionals[1];
    const policy = pack.policies.find((item) => item.id === id);
    if (!policy) throw new Error(`Unknown policy id: ${id ?? "(missing)"}`);
    process.stdout.write(`${policy.id}\n${policy.kind}\nTrigger: ${policy.trigger}\nSource: ${policy.source.title}\n${policy.source.url}\n`);
    return 0;
  }
  if (command !== "scan") throw new Error(`Unknown command: ${command}`);
  const root = positionals[1];
  if (!root) throw new Error("A repository directory is required.");
  const format = String(flags.format ?? "json");
  if (!new Set(["json", "markdown", "html"]).has(format)) throw new Error(`Unknown format: ${format}`);
  const report = await scanRepository({ root, pack, asOf: flags["as-of"] ?? new Date().toISOString().slice(0, 10) });
  const output = format === "json"
    ? `${JSON.stringify(report, null, 2)}\n`
    : format === "markdown"
      ? `${renderMarkdown(report)}\n`
      : await renderHtml(report);
  await emitOutput(output, flags);
  return report.summary.critical || report.summary.high ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`${error.message}\n\n${usage()}\n`);
    process.exitCode = 2;
  });
}

export { main, parseArgs };
