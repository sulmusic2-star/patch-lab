# Patch Lab

Local checks for authorized security-patch work and platform migrations.

Patch Lab inspects a local repository and reports what its files establish. Reward Radar records official security-patch programs, ranks their published opportunity ceilings and blocks candidate work until scope and repository identity are proven. It is read-only: it does not execute target code, probe live services, publish a pull request, disclose a vulnerability, submit a reward claim or edit a repository it scans.

The first reward adapter is **Google Open Source Security Patch Rewards**. It refreshes Google's named scope from a hard-coded official URL, records the retrieval time and SHA-256 digest, identifies the published reward boundary and produces a qualification report that stops when required information is missing.

The **HubSpot Version Proof** pack checks repository files against published platform requirements.

## Run it

Requires Node.js 20 or newer. There are no package dependencies.

```bash
npm test
node src/cli.mjs list-packs
node src/cli.mjs scan /path/to/repository --pack hubspot --format markdown
node src/cli.mjs scan /path/to/repository --pack hubspot --format html --output report.html
node src/cli.mjs explain HS_PLATFORM_2025_1 --pack hubspot

# Refresh and inspect the official reward scope
node src/cli.mjs rewards refresh
node src/cli.mjs rewards rank --tier 1 --limit 25

# Verify that a local clone is the named official project
node src/cli.mjs rewards qualify /path/to/clone --project zlib --output qualification.json

# Create a local research dossier. This does not execute, disclose or submit anything.
node src/cli.mjs rewards candidate /path/to/clone --project zlib --title "Local hardening hypothesis" --output candidate.md
```

Exit codes:

- `0` — no critical or high finding
- `1` — at least one critical or high finding
- `2` — invalid invocation or scan failure

Use `--as-of YYYY-MM-DD` to reproduce date-sensitive severity decisions. The report fingerprint excludes its generation timestamp, so the same source, policy pack, and date produce the same fingerprint.

## Product boundary

Patch Lab supplies bounded file collection, secret redaction, deterministic fingerprints, official-scope receipts, reward qualification, policy-pack execution and human reports.

Reward Radar shows a **policy ceiling**, never expected or earned revenue. A project being listed proves only that the project is in the saved scope. A patch still needs a defensible security benefit, duplicate review, the correct disclosure path, regression evidence, maintainer acceptance and reward-panel approval.

HubSpot Version Proof supplies the domain judgment: supported versions, migration paths, effective dates, native HubSpot alternatives, and compatibility questions that source alone cannot settle.

This is not a HubSpot schema validator. HubSpot already provides `hs project lint`, `hs project validate`, `hs project migrate`, a legacy-card converter, and a view-swap tool. The pack’s job is to show what the repository contains, choose the correct native path, expose decisions the native command cannot make, and preserve the evidence before an upload.

## Current status

This is a public alpha. Passing tests, scope receipts and candidate dossiers are engineering proof, not proof of a vulnerability, eligible patch, merger, submission, bounty, payment, customer, production outage or safe production deployment.

The reward method and its limits are in [docs/reward-radar.md](docs/reward-radar.md). Security invariants are in [SECURITY.md](SECURITY.md). The original evidence method is in [docs/method.md](docs/method.md), and the HubSpot checks remain in [docs/hubspot-policy-register.md](docs/hubspot-policy-register.md).

## Contributing and security

Contributions are welcome through GitHub pull requests. Read
[CONTRIBUTING.md](CONTRIBUTING.md) before opening one. Do not put a suspected
vulnerability in a public issue; use the repository's private vulnerability
reporting form as described in [SECURITY.md](SECURITY.md).

## License

Copyright 2026 Timothy Sullivan. Licensed under the Apache License, Version 2.0.
See [LICENSE](LICENSE).
