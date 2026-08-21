import { createHash } from "node:crypto";

import { markdownText } from "../render/markdown-escape.mjs";

export function buildCandidateDossier(qualification, { title = "Unspecified security hardening candidate" } = {}) {
  if (qualification?.schema !== "patch-lab/reward-qualification/v1") throw new TypeError("A reward qualification report is required.");
  const stable = {
    schema: "patch-lab/reward-candidate/v1",
    title,
    program: qualification.program,
    project: qualification.project,
    repository: qualification.repository.label,
    policySource: qualification.policySource,
    reward: qualification.reward,
    state: "research-only",
    disclosure: "blocked",
    submission: "not-authorized",
    payment: "not-earned",
    evidence: {
      hypothesis: null,
      attackerControlledInput: null,
      affectedBoundary: null,
      localReproduction: null,
      failingRegression: null,
      patchCommit: null,
      passingRegression: null,
      compatibilityChecks: [],
      duplicateSearch: [],
      maintainerDisposition: null,
    },
    gates: qualification.gates.map((item) => ({ ...item })),
    nextSafeAction: qualification.status === "eligible-for-local-triage"
      ? "Review the repository security policy and create a local, non-destructive hypothesis. Do not execute repository code outside an approved sandbox."
      : "Resolve the blocked scope and repository gates before research begins.",
  };
  const id = createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 16);
  return { ...stable, id };
}

export function renderCandidateMarkdown(candidate) {
  const lines = [
    `# ${markdownText(candidate.title)}`,
    "",
    `Candidate ID: \`${candidate.id}\`  `,
    `Program: ${markdownText(candidate.program.title)}  `,
    `Project: ${markdownText(candidate.project.name)}  `,
    `State: **${markdownText(candidate.state)}**  `,
    `Submission: **${markdownText(candidate.submission)}**  `,
    `Payment: **${markdownText(candidate.payment)}**`,
    "",
    "## Reward boundary",
    "",
    `Published base maximum: $${candidate.reward.baseMaximumUsd.toLocaleString("en-US")}  `,
    `Possible policy multiplier: ${candidate.reward.possibleMultiplier}×  `,
    `Policy ceiling: $${candidate.reward.policyCeilingUsd.toLocaleString("en-US")}`,
    "",
    `> ${markdownText(candidate.reward.boundary)}`,
    "",
    "## Gates",
    "",
    ...candidate.gates.map((gate) => `- **${markdownText(gate.state.toUpperCase())} — ${markdownText(gate.id)}:** ${markdownText(gate.evidence)}`),
    "",
    "## Evidence still required",
    "",
    "- A precise security hypothesis and attacker-controlled input.",
    "- Local reproduction without testing a live target.",
    "- A failing-before and passing-after regression test.",
    "- Duplicate search across issues, pull requests, commits and private disclosure guidance.",
    "- Compatibility checks and maintainer disposition.",
    "",
    "## Next safe action",
    "",
    markdownText(candidate.nextSafeAction),
  ];
  return `${lines.join("\n")}\n`;
}
