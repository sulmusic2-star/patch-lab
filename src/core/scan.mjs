import path from "node:path";

import { collectTextFiles, trackedFileSet } from "./files.mjs";
import { redactText } from "./redact.mjs";
import { buildReport } from "./schema.mjs";

export async function scanRepository({ root, pack, asOf = new Date().toISOString().slice(0, 10) }) {
  if (!pack?.id || typeof pack.scanFile !== "function") throw new TypeError("A valid policy pack is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`))) {
    throw new TypeError("asOf must be an ISO date in YYYY-MM-DD form.");
  }
  const collection = await collectTextFiles(root, pack.fileSelection);
  const tracked = await trackedFileSet(collection.absoluteRoot);
  const context = {
    asOf,
    root: collection.absoluteRoot,
    tracked,
    files: collection.files,
    state: {},
  };
  const findings = [];
  const maxFindingsPerFile = pack.maxFindingsPerFile ?? 100;
  const maxFindings = pack.maxFindings ?? 5_000;
  for (const file of collection.files) {
    const emitted = await pack.scanFile(file, context);
    if (emitted?.length > maxFindingsPerFile) {
      throw new Error(`Policy pack emitted more than ${maxFindingsPerFile} findings for ${file.relative}; refusing an unbounded report.`);
    }
    if (emitted?.length) findings.push(...emitted);
    if (findings.length > maxFindings) throw new Error(`Policy pack emitted more than ${maxFindings} findings; refusing an unbounded report.`);
  }
  if (typeof pack.finalize === "function") {
    findings.push(...await pack.finalize(context));
    if (findings.length > maxFindings) throw new Error(`Policy pack emitted more than ${maxFindings} findings; refusing an unbounded report.`);
  }

  const limitations = [...(pack.limitations ?? [])];
  if (collection.errors.length) {
    limitations.push(`${collection.errors.length} path${collection.errors.length === 1 ? " was" : "s were"} unreadable; this report may be incomplete.`);
  }
  if (collection.skippedLarge) limitations.push(`${collection.skippedLarge} oversized text file${collection.skippedLarge === 1 ? " was" : "s were"} skipped.`);
  if (collection.skippedBinary) limitations.push(`${collection.skippedBinary} binary-looking file${collection.skippedBinary === 1 ? " was" : "s were"} skipped.`);
  if (collection.hitFileLimit) limitations.push("The scan reached its file limit; this report is incomplete.");
  if (tracked === null) limitations.push("Git tracking status was unavailable, so tracked-secret checks were not run.");

  return buildReport({
    pack,
    rootLabel: path.basename(collection.absoluteRoot),
    asOf,
    inventory: {
      textFilesScanned: collection.files.length,
      unreadablePaths: collection.errors.length,
      skippedLargeFiles: collection.skippedLarge,
      skippedBinaryFiles: collection.skippedBinary,
      textBytesScanned: collection.totalBytes,
    },
    findings: JSON.parse(redactText(JSON.stringify(findings), { root: collection.absoluteRoot })),
    limitations,
  });
}
