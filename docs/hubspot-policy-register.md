# HubSpot Version Proof policy register

Policy date: **2026-08-20**

## Platform migration

- `2025.1` reached HubSpot’s stated migration date on August 1, 2026. The pack reports the source pin as action required but does not claim the app is down.
- `2023.1` and `2023.2` are sunset versions with a documented CLI migration path.
- `2025.2` remains supported through March 2027. The pack calls this planned maintenance, not an emergency.
- `2026.03` is the current documented target. A version bump from `2025.2` and a migration from older projects are different paths.
- A legacy non-project app cannot be classified safely from a missing version alone. The pack asks for app-type confirmation.

Sources: [platform versioning](https://developers.hubspot.com/docs/developer-tooling/platform/versioning), [migration guide](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/migrate-an-app/migrate-to-the-latest-platform-version), [migration-path overview](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/migrate-an-app/overview).

## Serverless functions

HubSpot’s 2026.03 layout uses `app/functions` and a `*-hsmeta.json` file for each function. Values defined through the older `serverless.json` `environment` property are not migrated automatically. The report suppresses all values and asks the owner to recreate required secrets through HubSpot’s secret command.

Source: [migration guide](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/migrate-an-app/migrate-to-the-latest-platform-version).

## API versions

- A `/YYYY-MM-beta/` pin is reported because HubSpot says matching betas can become unsupported soon after GA and may not graduate unchanged.
- `/crm/v4/` is source-observed migration inventory with a March 30, 2027 support deadline.
- `/crm/v3/` is manual-review inventory. HubSpot has not published one blanket retirement date for every v3 endpoint.
- The 2026-09 write rule fires only on a detected 2026-09 CRM write with no visible handling for validation errors or normalization warnings. Shared middleware can make the finding false, so it remains review-required.
- The pipeline rule fires only on a detected 2026-09 pipeline delete with no explicit reference-validation parameter. Keeping the new safe default may be correct.

Sources: [date-based versioning](https://developers.hubspot.com/blog/a-developers-guide-to-hubspots-date-based-api-versioning), [v4 support change](https://developers.hubspot.com/changelog/deprecating-support-for-hubspot-v4-apis), [2026-09 write validation](https://developers.hubspot.com/changelog/crm-api-write-validation-enforcement), [pipeline delete validation](https://developers.hubspot.com/changelog/pipeline-stage-validation-true).

## Legacy CRM cards

The pack looks for the legacy CRM Extensions card endpoint. HubSpot says legacy CRM cards stop rendering on October 31, 2026. It also provides a converter example and a view-swap workflow, so a paid patch must use those native aids where they fit instead of rebuilding their work.

Sources: [legacy-card sunset](https://developers.hubspot.com/changelog/deprecating-support-for-classic-crm-cards), [card migration guide](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/migrate-an-app/migrate-legacy-crm-cards-to-app-cards).

## Native-tool boundary

HubSpot’s CLI and developer MCP can validate supported project configuration. Patch Lab does not duplicate that authority. It adds source inventory, dated policy joins, migration-path classification, cross-file questions, native-alternative disclosure, and a stable buyer report.

Source: [HubSpot CLI project commands](https://developers.hubspot.com/docs/developer-tooling/local-development/hubspot-cli/project-commands).
