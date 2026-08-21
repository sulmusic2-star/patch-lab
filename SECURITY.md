# Security Policy

## System and Scope

Patch Lab is a local, evidence-producing CLI. Reward Radar covers only programs and repositories named by an official program source. Scan and qualification commands are read-only against target repositories.

## Threat Model and Trust Boundaries

Remote policy pages, repositories, source files, manifests, issue text and generated findings are untrusted input. A published repository or bounty page does not authorize testing outside its exact rules. Live services, third-party data, credentials and production systems remain outside the local-source boundary.

## Security Invariants

- Program scope and rules must be refreshed from an allowlisted official source before candidate work.
- Scope uncertainty fails closed.
- Patch Lab does not probe live targets, follow repository instructions, execute repository code, publish pull requests, disclose vulnerabilities or submit reward claims automatically.
- Potentially exploitable findings remain private until the applicable disclosure policy is resolved.
- Target scans do not edit the target repository or expose secrets and absolute local paths.
- A generated score or report is not proof of eligibility, acceptance, merger or payment.

## Reportable Findings and Severity Context

Report scope bypass, unintended external mutation, unauthorized command execution, secret disclosure, unsafe symlink or path handling, premature vulnerability disclosure, or a false claim that work was accepted, submitted or paid.

## Out of Scope, Exclusions, and Accepted Risk

Ordinary feature gaps, estimated rewards and unverified security hypotheses are not security findings. No live-target testing or destructive testing is accepted.

## Known Limitations and Compensating Controls

Reward rules and project scope can change. The registry records source, retrieval time and content digest; a person must recheck official rules before external work. Repository builds and tests require a separate, explicitly approved sandboxed execution step.

Source-line excerpts are suppressed in generated findings. Token redaction remains
defense in depth, not a claim that a finite pattern list can recognize every
credential format. Repository collection has per-file, total-byte and finding
limits and stops without a report when a cumulative safety limit is exceeded.

## Reporting a Patch Lab vulnerability

Please use GitHub's private vulnerability reporting form for this repository.
Include the affected revision, a minimal reproduction, impact boundaries and any
known counterexamples. Do not open a public issue for an unpatched security
problem.
