export const SOURCES = Object.freeze({
  platformVersions: {
    title: "Platform and API versioning",
    url: "https://developers.hubspot.com/docs/developer-tooling/platform/versioning",
  },
  migration202603: {
    title: "Migration to platform 2026.03",
    url: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/migrate-an-app/migrate-to-the-latest-platform-version",
  },
  migrationPaths: {
    title: "Choose a 2026.03 migration path",
    url: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/migrate-an-app/overview",
  },
  apiVersioning: {
    title: "Date-based API versioning",
    url: "https://developers.hubspot.com/blog/a-developers-guide-to-hubspots-date-based-api-versioning",
  },
  apiV4: {
    title: "v4 API support deprecation",
    url: "https://developers.hubspot.com/changelog/deprecating-support-for-hubspot-v4-apis",
  },
  writeValidation: {
    title: "2026-09 write validation",
    url: "https://developers.hubspot.com/changelog/crm-api-write-validation-enforcement",
  },
  pipelineDelete: {
    title: "2026-09 pipeline delete validation",
    url: "https://developers.hubspot.com/changelog/pipeline-stage-validation-true",
  },
  legacyCards: {
    title: "Legacy CRM card deprecation",
    url: "https://developers.hubspot.com/changelog/deprecating-support-for-classic-crm-cards",
  },
  legacyCardMigration: {
    title: "Legacy card migration",
    url: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/migrate-an-app/migrate-legacy-crm-cards-to-app-cards",
  },
  cli: {
    title: "HubSpot project CLI commands",
    url: "https://developers.hubspot.com/docs/developer-tooling/local-development/hubspot-cli/project-commands",
  },
  secretScanning: {
    title: "GitHub secret scanning",
    url: "https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning",
  },
});

export const POLICY_VERSION = "2026-08-20";

export const POLICY_REGISTER = Object.freeze([
  { id: "HS_PLATFORM_2025_1", kind: "observed", trigger: "top-level project platformVersion is 2025.1", deadline: "2026-08-01", source: SOURCES.platformVersions },
  { id: "HS_PLATFORM_SUNSET", kind: "observed", trigger: "top-level project platformVersion is 2023.1 or 2023.2", deadline: null, source: SOURCES.platformVersions },
  { id: "HS_PLATFORM_2025_2", kind: "observed", trigger: "top-level project platformVersion is 2025.2", deadline: "2027-03-01", source: SOURCES.migrationPaths },
  { id: "HS_PLATFORM_UNKNOWN", kind: "review-required", trigger: "top-level project platformVersion is missing or unrecognized", deadline: null, source: SOURCES.platformVersions },
  { id: "HS_SERVERLESS_ENV_MIGRATION", kind: "observed", trigger: "serverless.json contains an environment property", deadline: null, source: SOURCES.migration202603 },
  { id: "HS_SERVERLESS_LAYOUT_MIGRATION", kind: "observed", trigger: "older app.functions or appFunctions layout is present outside an archived migration copy", deadline: null, source: SOURCES.migrationPaths },
  { id: "HS_LEGACY_CRM_CARD", kind: "observed", trigger: "CRM Extensions cards endpoint appears in source", deadline: "2026-10-31", source: SOURCES.legacyCards },
  { id: "HS_API_BETA_PIN", kind: "observed", trigger: "a date-based beta API path appears in source", deadline: null, source: SOURCES.apiVersioning },
  { id: "HS_API_V4", kind: "observed", trigger: "a /crm/v4/ path appears in source", deadline: "2027-03-30", source: SOURCES.apiV4 },
  { id: "HS_API_V3_INVENTORY", kind: "review-required", trigger: "a /crm/v3/ path appears in source", deadline: null, source: SOURCES.apiVersioning },
  { id: "HS_2026_09_WRITE_HANDLING", kind: "review-required", trigger: "a 2026-09 CRM write appears without visible 400/warnings handling", deadline: null, source: SOURCES.writeValidation },
  { id: "HS_2026_09_PIPELINE_DELETE", kind: "review-required", trigger: "a 2026-09 pipeline delete appears without explicit reference policy", deadline: null, source: SOURCES.pipelineDelete },
  { id: "HS_CLI_OLD_FOR_MIGRATION", kind: "observed", trigger: "declared @hubspot/cli version is below the recommended 8.4.0", deadline: null, source: SOURCES.migration202603 },
  { id: "REPOSITORY_TRACKED_ENV", kind: "observed", trigger: "a Git-tracked .env file contains assignments", deadline: null, source: SOURCES.secretScanning },
]);
