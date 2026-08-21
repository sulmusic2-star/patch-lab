import { markdownLink, markdownText } from "./markdown-escape.mjs";

function deadlineText(deadline) {
  return deadline ? `\n- **Deadline:** ${markdownText(deadline)}` : "";
}

export function renderMarkdown(report) {
  const observed = report.findings.filter((item) => item.confidence === "observed");
  const review = report.findings.filter((item) => item.confidence === "review-required");
  const lines = [
    `# ${markdownText(report.pack.title)}`,
    "",
    `**Outcome:** ${markdownText(report.outcome)}`,
    "",
    `Repository: ${markdownText(report.repository)}  `,
    `Policy date: ${markdownText(report.pack.policyVersion)}  `,
    `Scan date used for deadlines: ${markdownText(report.asOf)}  `,
    `Fingerprint: ${markdownText(report.fingerprint)}`,
    "",
    `Patch Lab read ${report.inventory.textFilesScanned} text files and found ${report.summary.findings} evidence item${report.summary.findings === 1 ? "" : "s"}. ${report.summary.observed} are directly observed in source; ${report.summary.review} require a person to verify behavior or context.`,
    "",
    "## Confirmed in source",
    "",
  ];
  if (!observed.length) lines.push("No covered migration issue was directly observed.", "");
  for (const item of observed) lines.push(...renderFinding(item));
  lines.push("## Needs manual review", "");
  if (!review.length) lines.push("No manual-review item was raised by the covered policies.", "");
  for (const item of review) lines.push(...renderFinding(item));
  lines.push(
    "## Safe migration sequence",
    "",
    "1. Confirm that the scanned repository and branch are the source used for the live app.",
    "2. Run the applicable HubSpot migration command in a new branch. Review generated UIDs, features, secrets, request shapes, and error handling before upload.",
    "3. Run repository tests, `hs project lint`, and `hs project validate`. Upload or deploy only after the owner approves the reviewed change set.",
    "",
    "## What this report does not prove",
    "",
    ...report.limitations.map((item) => `- ${markdownText(item)}`),
    "",
    "## Policy sources",
    "",
    ...uniqueSources(report).map((source) => `- ${markdownLink(source.title, source.url)}`),
    "",
  );
  return lines.join("\n");
}

function renderFinding(item) {
  return [
    `### ${markdownText(item.severity.toUpperCase())}: ${markdownText(item.title)}`,
    "",
    `- **Found:** ${markdownText(item.evidence.file)}:${Number(item.evidence.line)} (${markdownText(item.evidence.scope)}) — ${markdownText(item.evidence.excerpt)}`,
    `- **Why it matters:** ${markdownText(item.meaning)}`,
    `- **Next step:** ${markdownText(item.nextStep)}`,
    item.nativeAlternative ? `- **HubSpot’s native option:** ${markdownText(item.nativeAlternative)}` : null,
    deadlineText(item.deadline).trim() || null,
    `- **Policy source:** ${markdownLink(item.source.title, item.source.url)}`,
    "",
  ].filter((line) => line !== null);
}

function uniqueSources(report) {
  return [...new Map(report.findings.map((item) => [item.source.url, item.source])).values()];
}
