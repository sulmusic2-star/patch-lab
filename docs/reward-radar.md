# Reward Radar: scope, ranking and limits

Policy snapshot: **2026-08-20**

## Program selection

Patch Lab records programs with an official payer, published scope, submission instructions and a reward schedule. The first program is Google Open Source Security Patch Rewards because it pays for proactive security improvements to open-source projects rather than requiring a sales process.

Official sources:

- [Patch Rewards program and reward categories](https://bughunters.google.com/open-source-security/patch-rewards)
- [Official project scope](https://github.com/google/bughunters/blob/main/patch-rewards-program/scope.md)
- [Google OSS Vulnerability Reward Program](https://bughunters.google.com/about/rules/open-source/google-open-source-software-vulnerability-reward-program-rules)
- [Microsoft bounty programs](https://www.microsoft.com/en-us/msrc/bounty-programs)
- [Apple Security Bounty](https://security.apple.com/bounty/)

## Program types

### Proactive merged patches

Google publishes four base categories for tier 1 patches: $500, $2,000, $7,500 and $15,000. It also publishes temporary 2× and 3× multipliers for qualifying secure-by-design memory-safety work through the end of 2026. A displayed $30,000 or $45,000 number is arithmetic applied to the published policy, not a prediction that a patch will qualify or be paid.

This is the repeatable starting lane because research can begin from public source without sales outreach. The maintainer still has to accept the work, and Google still decides eligibility and amount.

### Vulnerability reports in open source

Google's OSS VRP publishes awards up to $31,337 for certain tier 0 supply-chain compromises and up to $7,500 for certain flagship product vulnerabilities. Microsoft publishes up to $15,000 for selected open-source vulnerabilities. These lanes can pay more per discovery than an ordinary patch but require a reproducible security impact, first-report status and coordinated disclosure.

### Platform security research

Google, Microsoft, Meta and Apple publish six- and seven-figure maximums for high-impact product vulnerabilities and exploit chains. Those amounts are real program ceilings, but they require specialist research and are not the starting forecast. Research at that level would require relevant experience and a reliable disclosure process.

### Possible product work

After at least five accepted or rewarded patches, the deterministic radar, evidence ledger and local proof workflow may be packaged for maintainers or research teams through self-serve developer distribution. Pricing and recurring-revenue claims remain unset until outside users demonstrate demand.

## Deterministic ranking

The initial priority score uses only visible policy attributes:

- named tier 1 project: 40 points;
- tier 2 collection member: 15 points before member resolution;
- current 3× parser-memory-safety policy ceiling: 35 points;
- current 2× tier 1 memory-safety policy ceiling: 20 points;
- direct public source URL: 10 points;
- named project rather than collection: 5 points.

The score does **not** estimate vulnerability probability, maintainer interest, merge time or payout probability. Every row begins `unqualified`.

## Research gates

A candidate may enter local triage only when:

1. the project is named in a freshly retrieved official scope;
2. the local Git remote matches the official project URL;
3. the project's disclosure policy is found and reviewed;
4. equivalent issues, pull requests, commits and disclosures have been searched;
5. the hypothesis can be reproduced locally without probing a live target;
6. a failing-before and passing-after regression can be produced;
7. compatibility and performance effects are measured;
8. the maintainer's contribution path is followed;
9. an external pull request or private disclosure is separately authorized;
10. merger, reward submission and payment are recorded as separate events.

## Thirty-day operating gate

- Refresh and rank the full official scope.
- Statistically inspect the best ten direct-source candidates without executing them.
- Select at most three for separately approved sandboxed builds and local fuzzing.
- Produce one high-confidence patch package before any external submission.
- Stop a lane after three technically sound candidates are rejected as duplicates, out of scope or unwanted for the same reason.
- Do not forecast revenue until a program confirms eligibility; do not record revenue until payment settles.

The first month may produce no payment because merge, disclosure and reward review take time. An accepted patch would be the first useful milestone.
