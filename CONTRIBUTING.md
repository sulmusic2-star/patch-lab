# Contributing to Patch Lab

Patch Lab accepts focused changes that preserve its fail-closed evidence model.

Before opening a pull request:

1. Explain the observable problem and the evidence source.
2. Keep policy facts linked to an official source and separate them from
   interpretation.
3. Add a regression for every behavior change.
4. Run `npm test` on Node.js 20 or newer.
5. Confirm that generated output contains no credentials, private repository
   material or absolute local paths.

Please keep unrelated changes in separate pull requests. A candidate, report or
passing test must never be described as accepted, merged, rewarded or paid
without the corresponding external receipt.

Report suspected vulnerabilities privately through the repository Security
page, not through a public issue.
