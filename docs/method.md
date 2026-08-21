# Patch Lab method

## The unit of value

A Patch Lab finding joins four things:

1. a source fact at a file and line;
2. a dated policy from the platform owner;
3. a narrow statement of what the two facts establish;
4. the next reversible action.

If any part is missing, the item is not ready for a buyer report.

## Confidence

**Observed** means the repository directly contains the trigger: a platform version, endpoint, configuration property, or tracked environment file.

**Review-required** means a person must inspect runtime context, shared middleware, account settings, app type, or an endpoint-specific migration before calling it a defect. The report never promotes a review item to a confirmed failure because the deadline is close.

## Safety

- The collector does not follow symlinks.
- Common dependency, build, cache, and version-control directories are skipped.
- Files larger than 1 MB and binary-looking files are skipped and counted.
- Common tokens and secret assignments are redacted before findings enter the report.
- `.env` values are never printed. The tracked-file finding runs only when Git confirms the file is tracked.
- Absolute repository paths are removed from the report.
- A scan never runs a platform migration, upload, deploy, or target-repository edit.

## Fingerprints

The SHA-256 fingerprint covers the policy pack, policy version, repository label, scan date used for deadline decisions, inventory, findings, and limits. It excludes the generation timestamp and absolute path. A changed policy, finding, line, excerpt, or scan date changes the fingerprint.

## Release gate for a policy pack

A pack should not be called production-ready until it has:

- official sources for every policy;
- positive and negative fixtures for every rule;
- a false-positive review on maintained public repositories;
- explicit native-tool and free-alternative boundaries;
- a named policy date and owner;
- no secret disclosure in JSON, Markdown, or HTML output;
- a buyer-reviewed report that can be understood without a sales call.

The HubSpot pack does not yet meet the last two commercial gates: no buyer has reviewed it and no one has paid for it.
