import { hasAssignedValue } from "../../core/redact.mjs";
import { POLICY_REGISTER, POLICY_VERSION, SOURCES } from "./policies.mjs";

const MAX_MATCHES_PER_PATTERN = 256;

const TEXT_EXTENSIONS = [
  ".cjs", ".env", ".html", ".java", ".js", ".json", ".jsx", ".kt", ".mjs", ".php",
  ".py", ".rb", ".ts", ".tsx", ".vue", ".yaml", ".yml",
];

const PLATFORM_PROJECT_NAMES = new Set(["hsproject.json"]);
const WRITE_METHOD = /(?:method\s*:\s*["'](?:POST|PATCH|PUT)["']|\.(?:post|patch|put|create|update)\s*\()/i;
const DELETE_METHOD = /(?:method\s*:\s*["']DELETE["']|\.delete\s*\()/i;

function lineNumber(text, offset) {
  return text.slice(0, Math.max(0, offset)).split("\n").length;
}

function evidenceScope(relative) {
  return /(?:^|\/)(?:test|tests|__tests__|fixture|fixtures|example|examples|sample|samples)(?:\/|$)|\.(?:test|spec)\.[^.]+$/i.test(relative)
    ? "test-or-example"
    : "runtime-source";
}

function isCommentOnly(text, offset) {
  const lineStart = text.lastIndexOf("\n", offset) + 1;
  const beforeOnLine = text.slice(lineStart, offset).trimStart();
  if (/^(?:\/\/|#|\*|<!--)/.test(beforeOnLine)) return true;
  if (text.lastIndexOf("/*", offset) > text.lastIndexOf("*/", offset)) return true;
  if (text.lastIndexOf("<!--", offset) > text.lastIndexOf("-->", offset)) return true;
  return false;
}

function codeMatches(text, pattern) {
  const expression = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const items = [];
  let match;
  while ((match = expression.exec(text)) !== null) {
    if (!isCommentOnly(text, match.index)) items.push(match);
    if (items.length >= MAX_MATCHES_PER_PATTERN) break;
    if (!match[0]) expression.lastIndex += 1;
  }
  return { items, capped: items.length >= MAX_MATCHES_PER_PATTERN };
}

function evidence(file, text, offset, replacement = null) {
  return {
    file: file.relative,
    line: lineNumber(text, offset),
    excerpt: replacement ?? "detector match found; source text suppressed",
    scope: evidenceScope(file.relative),
  };
}

function finding({ policyId, severity, confidence = "observed", title, meaning, nextStep, file, text, offset = 0, excerpt = null, source, deadline = null, nativeAlternative = null, automatable = false }) {
  return {
    policyId,
    severity,
    confidence,
    title,
    meaning,
    nextStep,
    evidence: evidence(file, text, offset, excerpt),
    source,
    deadline,
    nativeAlternative,
    automatable,
  };
}

function isOnOrAfter(asOf, date) {
  return Date.parse(`${asOf}T00:00:00Z`) >= Date.parse(`${date}T00:00:00Z`);
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function topLevelProject(config) {
  return config && typeof config === "object" && !Array.isArray(config) && "srcDir" in config;
}

function scanProject(file, context) {
  const { text } = file;
  const config = parseJson(text);
  if (!config) {
    if (!/["'](?:srcDir|platformVersion)["']\s*:/.test(text)) return [];
    return [finding({
      policyId: "HS_PROJECT_INVALID_JSON",
      severity: "high",
      title: "HubSpot project configuration is not valid JSON",
      meaning: "The project cannot be classified safely from this file.",
      nextStep: "Repair the JSON syntax, then run HubSpot’s project validator before any migration.",
      file,
      text,
      excerpt: "hsproject.json could not be parsed; source content suppressed",
      source: SOURCES.cli,
    })];
  }
  if (!topLevelProject(config)) return [];
  context.state.project = { file: file.relative, platformVersion: String(config.platformVersion ?? ""), config };
  const platformVersion = context.state.project.platformVersion;
  const offset = Math.max(0, text.indexOf("platformVersion"));
  if (platformVersion === "2025.1") {
    return [finding({
      policyId: "HS_PLATFORM_2025_1",
      severity: isOnOrAfter(context.asOf, "2026-08-01") ? "critical" : "high",
      title: "Project uses unsupported platform version 2025.1",
      meaning: "HubSpot’s migration guidance set August 1, 2026 as the migration date for 2025.1. A source pin proves migration work is due; it does not prove the running app is down.",
      nextStep: "Run the repository-only checks first, then use `hs project migrate` in a branch and review the generated changes before upload.",
      file,
      text,
      offset,
      excerpt: "platformVersion: 2025.1",
      source: SOURCES.migration202603,
      deadline: "2026-08-01",
      nativeAlternative: "HubSpot provides `hs project migrate`; Patch Lab should document the decisions and regressions around that native migration, not replace it.",
    })];
  }
  if (platformVersion === "2023.1" || platformVersion === "2023.2") {
    return [finding({
      policyId: "HS_PLATFORM_SUNSET",
      severity: "critical",
      title: `Project uses sunset platform version ${platformVersion}`,
      meaning: "HubSpot identifies 2023.1 and 2023.2 as sunset project versions that still have a migration path to 2026.03.",
      nextStep: "Create a migration branch, run `hs project migrate`, inspect generated UIDs and feature changes, then validate without uploading.",
      file,
      text,
      offset,
      excerpt: `platformVersion: ${platformVersion}`,
      source: SOURCES.migration202603,
      nativeAlternative: "HubSpot’s CLI performs the initial migration; keep its output reviewable and out of production until validated.",
    })];
  }
  if (platformVersion === "2025.2") {
    return [finding({
      policyId: "HS_PLATFORM_2025_2",
      severity: "medium",
      title: "Project is supported on 2025.2, with 2026.03 available",
      meaning: "HubSpot says 2025.2 remains supported through March 2027. This is planned maintenance, not an emergency.",
      nextStep: "Inventory serverless functions and test a platformVersion change to 2026.03 in a branch before the support window closes.",
      file,
      text,
      offset,
      excerpt: "platformVersion: 2025.2",
      source: SOURCES.migrationPaths,
      deadline: "2027-03-01",
      nativeAlternative: "For 2025.2, HubSpot directs developers to update platformVersion and run `hs project upload` after review.",
      automatable: true,
    })];
  }
  if (!platformVersion) {
    return [finding({
      policyId: "HS_PLATFORM_UNKNOWN",
      severity: "review",
      confidence: "review-required",
      title: "Top-level HubSpot project has no platformVersion",
      meaning: "The file shape looks like a project, but source alone does not establish its legacy app type or migration route.",
      nextStep: "Confirm whether this is a project-based app, legacy public app, or legacy private app before choosing a migration command.",
      file,
      text,
      excerpt: "top-level hsproject.json has srcDir but no platformVersion",
      source: SOURCES.migrationPaths,
    })];
  }
  if (!/^20\d{2}\.\d{1,2}$/.test(platformVersion)) {
    return [finding({
      policyId: "HS_PLATFORM_UNKNOWN",
      severity: "review",
      confidence: "review-required",
      title: "HubSpot platform version is unrecognized",
      meaning: "The policy pack does not know whether this value is supported.",
      nextStep: "Check HubSpot’s current platform version history and run the native validator before changing it.",
      file,
      text,
      offset,
      excerpt: "unrecognized platformVersion value; value suppressed",
      source: SOURCES.platformVersions,
    })];
  }
  return [];
}

function scanPackage(file) {
  if (file.name !== "package.json") return [];
  const config = parseJson(file.text);
  const declared = config?.devDependencies?.["@hubspot/cli"] ?? config?.dependencies?.["@hubspot/cli"];
  if (!declared) return [];
  const match = String(declared).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [];
  const [major, minor] = [Number(match[1]), Number(match[2])];
  if (major > 8 || (major === 8 && minor >= 4)) return [];
  const offset = Math.max(0, file.text.indexOf("@hubspot/cli"));
  return [finding({
    policyId: "HS_CLI_OLD_FOR_MIGRATION",
    severity: "medium",
    title: `Repository declares @hubspot/cli ${match[0]}`,
    meaning: "HubSpot recommends CLI 8.4.0 or newer for migration to developer platform 2026.03.",
    nextStep: "Update the CLI on a branch, run the test suite, then run `hs project lint` and `hs project validate` locally.",
    file,
    text: file.text,
    offset,
    excerpt: `@hubspot/cli numeric version: ${match[0]}`,
    source: SOURCES.migration202603,
    nativeAlternative: "HubSpot’s `hs project lint` and `hs project validate` cover native schema and lint checks.",
    automatable: true,
  })];
}

function scanServerless(file, context) {
  const findings = [];
  if (file.name === "serverless.json") {
    const config = parseJson(file.text);
    if (config && Object.prototype.hasOwnProperty.call(config, "environment")) {
      findings.push(finding({
        policyId: "HS_SERVERLESS_ENV_MIGRATION",
        severity: "high",
        title: "Legacy serverless environment configuration needs manual secret migration",
        meaning: "HubSpot says values in serverless.json’s environment property are not migrated automatically to the 2026.03 project structure.",
        nextStep: "Inventory variable names without copying values into the report, then recreate each required value with `hs secret add` in the target account.",
        file,
        text: file.text,
        offset: Math.max(0, file.text.indexOf("environment")),
        excerpt: "serverless.json contains an environment property; values suppressed",
        source: SOURCES.migration202603,
      }));
    }
  }
  if ((file.relative.includes("app.functions/") || /["']appFunctions["']\s*:/.test(file.text)) && !context.state.serverlessLayout) {
      context.state.serverlessLayout = file.relative;
      findings.push(finding({
        policyId: "HS_SERVERLESS_LAYOUT_MIGRATION",
        severity: "high",
        title: "Older serverless function layout is present",
        meaning: "HubSpot’s 2026.03 layout moves app functions into an app/functions directory with one *-hsmeta.json configuration per function.",
        nextStep: "Map each existing function, endpoint, method, and secret name to the 2026.03 layout, then test parity before upload.",
        file,
        text: file.text,
        offset: Math.max(0, file.text.search(/appFunctions|app\.functions/)),
        excerpt: "legacy app.functions or appFunctions layout detected",
        source: SOURCES.migrationPaths,
      }));
  }
  return findings;
}

function scanApiPaths(file, context) {
  const findings = [];
  const text = file.text;
  const testOnly = evidenceScope(file.relative) === "test-or-example";
  const betaMatches = codeMatches(text, /\/(20\d{2}-\d{2})-beta\//g);
  if (betaMatches.items.length) {
    const count = betaMatches.items.length;
    const match = betaMatches.items[0];
    findings.push(finding({
      policyId: "HS_API_BETA_PIN",
      severity: testOnly ? "review" : "high",
      confidence: testOnly ? "review-required" : "observed",
      title: `${betaMatches.capped ? "At least " : ""}${count} beta API path${count === 1 ? "" : "s"} in this file`,
      meaning: testOnly
        ? "The path appears only in test, fixture, example, or sample code. It does not prove the running integration uses the beta."
        : "HubSpot says the matching beta can fail after GA and does not guarantee that every beta feature graduates unchanged.",
      nextStep: "Identify the feature used at this call site and verify its GA destination before replacing the path.",
      file,
      text,
      offset: match.index,
      excerpt: "date-based beta API path detected; surrounding source suppressed",
      source: SOURCES.apiVersioning,
    }));
  }

  const v4Matches = codeMatches(text, /\/crm\/v4\//g);
  if (v4Matches.items.length) {
    const count = v4Matches.items.length;
    findings.push(finding({
      policyId: "HS_API_V4",
      severity: testOnly ? "review" : isOnOrAfter(context.asOf, "2027-03-30") ? "critical" : "medium",
      confidence: testOnly ? "review-required" : "observed",
      title: `${v4Matches.capped ? "At least " : ""}${count} HubSpot CRM v4 path${count === 1 ? "" : "s"} in this file`,
      meaning: testOnly
        ? "The v4 path appears only in test, fixture, example, or sample code. It does not prove the running integration uses v4; confirm runtime use before planning a migration."
        : "HubSpot will move v4 APIs to unsupported status on March 30, 2027. The path inventory is confirmed; a compatible replacement still needs endpoint-level review.",
      nextStep: "Map each v4 operation to the latest documented date-based endpoint and compare request, response, paging, and error behavior in fixtures.",
      file,
      text,
      offset: v4Matches.items[0].index,
      excerpt: "HubSpot CRM v4 path detected; surrounding source suppressed",
      source: SOURCES.apiV4,
      deadline: "2027-03-30",
    }));
  }

  const v3Matches = codeMatches(text, /\/crm\/v3\//g);
  if (v3Matches.items.length) {
    const count = v3Matches.items.length;
    findings.push(finding({
      policyId: "HS_API_V3_INVENTORY",
      severity: "review",
      confidence: "review-required",
      title: `${v3Matches.capped ? "At least " : ""}${count} HubSpot CRM v3 path${count === 1 ? "" : "s"} to classify`,
      meaning: testOnly
        ? "The v3 path appears only in test, fixture, example, or sample code. It may be a useful migration fixture, but it does not prove live use."
        : "HubSpot has not announced one blanket retirement date for every v3 endpoint. This is migration inventory, not proof of a defect.",
      nextStep: "Classify each endpoint against the current API reference; migrate only where HubSpot documents an equivalent date-based surface.",
      file,
      text,
      offset: v3Matches.items[0].index,
      excerpt: "HubSpot CRM v3 path detected; surrounding source suppressed",
      source: SOURCES.apiVersioning,
    }));
  }

  for (const match of codeMatches(text, /\/crm\/(?:objects\/)?2026-09(?:-beta)?\//g).items) {
    if (testOnly) continue;
    const window = text.slice(Math.max(0, match.index - 500), match.index + 900);
    if (!WRITE_METHOD.test(window)) continue;
    if (/(?:warnings|status\s*===?\s*400|response\.status|catch\s*\(|Bad Request|VALIDATION_ERROR)/i.test(window)) continue;
    findings.push(finding({
      policyId: "HS_2026_09_WRITE_HANDLING",
      severity: "review",
      confidence: "review-required",
      title: "2026-09 CRM write has no visible validation or warning handling",
      meaning: "The 2026-09 API can return admin-rule 400 errors and normalization warnings. A local text scan cannot prove how shared middleware handles the response.",
      nextStep: "Add fixtures for conditional required fields, required create fields, association permissions, and normalized datetime warnings; then confirm shared error handling.",
      file,
      text,
      offset: match.index,
      excerpt: "2026-09 CRM write path detected; surrounding source suppressed",
      source: SOURCES.writeValidation,
    }));
    break;
  }

  for (const match of codeMatches(text, /\/crm\/pipelines\/2026-09(?:-beta)?\//g).items) {
    if (testOnly) continue;
    const window = text.slice(Math.max(0, match.index - 500), match.index + 900);
    if (!DELETE_METHOD.test(window)) continue;
    if (/validateReferencesBeforeDelete|validateDealStageUsagesBeforeDelete/.test(window)) continue;
    findings.push(finding({
      policyId: "HS_2026_09_PIPELINE_DELETE",
      severity: "review",
      confidence: "review-required",
      title: "2026-09 pipeline delete needs an explicit reference policy",
      meaning: "HubSpot blocks deletion of referenced pipelines or stages by default in 2026-09. This may be the desired safety behavior.",
      nextStep: "Test the 400 path and decide whether to preserve the safe default or pass an explicit override after user confirmation.",
      file,
      text,
      offset: match.index,
      excerpt: "2026-09 pipeline delete path detected; surrounding source suppressed",
      source: SOURCES.pipelineDelete,
    }));
    break;
  }

  for (const match of codeMatches(text, /\/crm\/v3\/extensions\/cards(?:\/|\b)/g).items) {
    findings.push(finding({
      policyId: "HS_LEGACY_CRM_CARD",
      severity: testOnly ? "review" : isOnOrAfter(context.asOf, "2026-10-31") ? "critical" : "high",
      confidence: testOnly ? "review-required" : "observed",
      title: "Legacy CRM card endpoint appears in source",
      meaning: testOnly
        ? "The legacy endpoint appears only in test, fixture, example, or sample code. Confirm runtime use before treating the card as affected."
        : "HubSpot says legacy CRM cards stop rendering on October 31, 2026. The endpoint proves legacy-card code exists, not that a particular Marketplace listing is live.",
      nextStep: "Identify the card’s current views and actions, build the React App Card equivalent, test it in a developer account, then use HubSpot’s view swap process.",
      file,
      text,
      offset: match.index,
      excerpt: "legacy CRM card path detected; surrounding source suppressed",
      source: SOURCES.legacyCards,
      deadline: "2026-10-31",
      nativeAlternative: "HubSpot provides a legacy-card converter example and a developer-initiated view swap tool; use both where they fit before writing custom migration code.",
    }));
    break;
  }
  return findings;
}

function scanEnvironment(file, context) {
  const environmentFile = file.name === ".env" || (file.name.startsWith(".env.") && !/^\.env\.(?:example|sample|template)$/i.test(file.name));
  if (!environmentFile || context.tracked === null || !context.tracked.has(file.relative) || !hasAssignedValue(file.text)) return [];
  return [finding({
    policyId: "REPOSITORY_TRACKED_ENV",
    severity: "high",
    title: "Git-tracked .env file contains assigned values",
    meaning: "A tracked environment file can expose credentials or private configuration. Patch Lab does not print or retain the values.",
    nextStep: "Rotate any live credentials, remove the file from version control, add an example file with names only, and enable repository secret scanning.",
    file,
    text: file.text,
    excerpt: ".env contains one or more assignments; names and values suppressed",
    source: SOURCES.secretScanning,
  })];
}

export const hubspotPack = Object.freeze({
  id: "hubspot-version-proof",
  title: "HubSpot Version Proof",
  policyVersion: POLICY_VERSION,
  policies: POLICY_REGISTER,
  maxFindingsPerFile: 20,
  maxFindings: 5_000,
  fileSelection: {
    extensions: TEXT_EXTENSIONS,
    filenames: ["hsproject.json", "serverless.json", "package.json", ".env"],
    namePrefixes: [".env."],
    skipDirs: ["archive"],
    maxFileBytes: 1_000_000,
    maxTotalBytes: 64 * 1024 * 1024,
    maxFiles: 25_000,
  },
  limitations: [
    "Static source scan only: no HubSpot account, install count, Marketplace status, build, runtime log, or customer portal was inspected.",
    "Review-required items are compatibility questions, not confirmed defects.",
    "A source version or endpoint proves code inventory; it does not prove a production outage or active deployment.",
    "HubSpot’s native `hs project lint` and `hs project validate` remain authoritative for supported project schema checks.",
  ],
  async scanFile(file, context) {
    const findings = [];
    if (PLATFORM_PROJECT_NAMES.has(file.name)) findings.push(...scanProject(file, context));
    findings.push(...scanPackage(file));
    findings.push(...scanServerless(file, context));
    findings.push(...scanApiPaths(file, context));
    findings.push(...scanEnvironment(file, context));
    return findings;
  },
  async finalize(context) {
    if (!context.state.project) return [];
    return [];
  },
});

export { POLICY_REGISTER, SOURCES } from "./policies.mjs";
