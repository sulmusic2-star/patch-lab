import { createHash } from "node:crypto";

import { collectTextFiles } from "../core/files.mjs";

const SOURCE_EXTENSIONS = [
  ".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx",
  ".go", ".java", ".js", ".m", ".mm", ".py", ".rs", ".ts",
];

const SIGNALS = Object.freeze([
  { id: "raw-copy", expression: /\b(?:memcpy|memmove|strcpy|strncpy|strcat|strncat)\s*\(/g },
  { id: "formatted-write", expression: /\b(?:sprintf|vsprintf|snprintf|vsnprintf)\s*\(/g },
  { id: "raw-allocation", expression: /\b(?:malloc|calloc|realloc|free|new|delete)\b/g },
  { id: "parser-entry", expression: /\b(?:parse|parser|decode|deserialize|unpack|inflate|decompress)\w*\s*\(/gi },
  { id: "fuzz-entry", expression: /\b(?:LLVMFuzzerTestOneInput|fuzz_target|FuzzedDataProvider)\b/g },
]);

function countMatches(text, expression) {
  expression.lastIndex = 0;
  let count = 0;
  while (expression.exec(text)) count += 1;
  expression.lastIndex = 0;
  return count;
}

export async function profileRewardRepository({ qualification, repositoryRoot }) {
  if (qualification?.schema !== "patch-lab/reward-qualification/v1") throw new TypeError("A reward qualification report is required.");
  if (qualification.status !== "eligible-for-local-triage") throw new Error("Static profiling is blocked until official scope and repository identity pass.");
  const collection = await collectTextFiles(repositoryRoot, {
    extensions: SOURCE_EXTENSIONS,
    filenames: ["BUILD", "BUILD.bazel", "CMakeLists.txt", "Makefile", "WORKSPACE", "meson.build"],
    maxFileBytes: 1_000_000,
    maxFiles: 25_000,
  });
  const extensions = {};
  const totals = Object.fromEntries(SIGNALS.map((signal) => [signal.id, 0]));
  const hotspots = [];
  const fuzzFiles = new Set();

  for (const file of collection.files) {
    const key = file.extension || file.name;
    extensions[key] = (extensions[key] ?? 0) + 1;
    if (/fuzz/i.test(file.relative)) fuzzFiles.add(file.relative);
    const signals = {};
    let signalCount = 0;
    for (const signal of SIGNALS) {
      const count = countMatches(file.text, signal.expression);
      signals[signal.id] = count;
      totals[signal.id] += count;
      signalCount += count;
      if (signal.id === "fuzz-entry" && count) fuzzFiles.add(file.relative);
    }
    if (signalCount) hotspots.push({ file: file.relative, signalCount, signals });
  }

  hotspots.sort((a, b) => b.signalCount - a.signalCount || a.file.localeCompare(b.file));
  const stable = {
    schema: "patch-lab/reward-static-profile/v1",
    program: qualification.program,
    project: qualification.project,
    repository: qualification.repository.label,
    policySource: qualification.policySource,
    inventory: {
      textFilesScanned: collection.files.length,
      skippedLargeFiles: collection.skippedLarge,
      skippedBinaryFiles: collection.skippedBinary,
      unreadablePaths: collection.errors.length,
      hitFileLimit: collection.hitFileLimit,
      extensions: Object.fromEntries(Object.entries(extensions).sort(([a], [b]) => a.localeCompare(b))),
    },
    lexicalSignals: totals,
    fuzzHarnessFiles: [...fuzzFiles].sort().slice(0, 250),
    highSignalFiles: hotspots.slice(0, 50),
    state: "research-leads-only",
    limits: [
      "Lexical signals are navigation aids, not vulnerabilities or reward-eligible findings.",
      "Comments, wrappers and already-safe call sites can contribute to the counts.",
      "No repository code, build, test, fuzzer or live target was executed.",
      "Potentially exploitable behavior requires private, policy-compliant review before disclosure.",
    ],
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(stable)).digest("hex");
  return { ...stable, fingerprint };
}
