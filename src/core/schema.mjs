import { createHash } from "node:crypto";

export const SEVERITY_ORDER = Object.freeze({ critical: 0, high: 1, medium: 2, review: 3 });
export const CONFIDENCE = Object.freeze(["observed", "review-required"]);

export function normalizeFinding(item) {
  if (!item || typeof item !== "object") throw new TypeError("A policy pack returned an invalid finding.");
  if (!(item.severity in SEVERITY_ORDER)) throw new TypeError(`Unknown severity: ${item.severity}`);
  if (!CONFIDENCE.includes(item.confidence)) throw new TypeError(`Unknown confidence: ${item.confidence}`);
  for (const key of ["policyId", "title", "meaning", "nextStep"]) {
    if (!item[key] || typeof item[key] !== "string") throw new TypeError(`Finding is missing ${key}.`);
  }
  if (!item.evidence?.file || !Number.isInteger(item.evidence?.line)) throw new TypeError("Finding has invalid evidence.");
  if (!item.source?.title || !item.source?.url) throw new TypeError("Finding has no policy source.");
  return {
    ...item,
    evidence: { ...item.evidence, excerpt: String(item.evidence.excerpt ?? "") },
    automatable: Boolean(item.automatable),
  };
}

export function buildReport({ pack, rootLabel, asOf, inventory, findings, limitations }) {
  const sorted = findings.map(normalizeFinding).sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      || a.evidence.file.localeCompare(b.evidence.file)
      || a.evidence.line - b.evidence.line
      || a.policyId.localeCompare(b.policyId));
  const summary = {
    findings: sorted.length,
    critical: sorted.filter((item) => item.severity === "critical").length,
    high: sorted.filter((item) => item.severity === "high").length,
    medium: sorted.filter((item) => item.severity === "medium").length,
    review: sorted.filter((item) => item.confidence === "review-required").length,
    observed: sorted.filter((item) => item.confidence === "observed").length,
  };
  const outcome = summary.critical || summary.high
    ? "Action required"
    : summary.medium
      ? "Migration work identified"
      : summary.review
        ? "Manual review required"
        : "No covered migration issue found";
  const stable = {
    schema: "patch-lab/report/v1",
    pack: { id: pack.id, title: pack.title, policyVersion: pack.policyVersion },
    repository: rootLabel,
    asOf,
    inventory,
    summary,
    outcome,
    findings: sorted,
    limitations,
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(stable)).digest("hex");
  return { ...stable, generatedAt: new Date().toISOString(), fingerprint };
}
