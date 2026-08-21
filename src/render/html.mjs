import { readFile } from "node:fs/promises";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function uniqueSources(report) {
  return [...new Map(report.findings.map((item) => [item.source.url, item.source])).values()];
}

function findingHtml(item) {
  const native = item.nativeAlternative
    ? `<div class="fact"><h4>HubSpot’s native option</h4><p>${escapeHtml(item.nativeAlternative)}</p></div>`
    : "";
  const deadline = item.deadline
    ? `<div class="fact"><h4>Deadline</h4><p class="deadline"><time datetime="${escapeHtml(item.deadline)}">${escapeHtml(item.deadline)}</time></p></div>`
    : "";
  return `<article class="finding" id="${escapeHtml(item.policyId)}">
    <div class="finding-title">
      <p class="severity" data-level="${escapeHtml(item.severity)}">${escapeHtml(item.severity)} · ${escapeHtml(item.confidence)}</p>
      <h3>${escapeHtml(item.title)}</h3>
    </div>
    <div class="finding-body">
      <div class="fact fact-wide"><h4>Found · ${escapeHtml(item.evidence.scope)}</h4><pre class="evidence">${escapeHtml(item.evidence.file)}:${item.evidence.line}\n${escapeHtml(item.evidence.excerpt)}</pre></div>
      <div class="fact"><h4>Why it matters</h4><p>${escapeHtml(item.meaning)}</p></div>
      <div class="fact"><h4>Next step</h4><p>${escapeHtml(item.nextStep)}</p></div>
      ${native}${deadline}
      <div class="fact fact-wide"><h4>Policy source</h4><p><a href="${escapeHtml(item.source.url)}" rel="noreferrer">${escapeHtml(item.source.title)}</a></p></div>
    </div>
  </article>`;
}

export async function renderHtml(report) {
  const tokens = await readFile(new URL("../../tokens.css", import.meta.url), "utf8");
  const reportCss = (await readFile(new URL("./report.css", import.meta.url), "utf8"))
    .replace('@import "../../tokens.css";', "");
  const findings = report.findings.length
    ? report.findings.map(findingHtml).join("\n")
    : `<p>No covered migration issue was found. This is not a certification: read the coverage limits below.</p>`;
  const sources = uniqueSources(report)
    .map((source) => `<li><a href="${escapeHtml(source.url)}" rel="noreferrer">${escapeHtml(source.title)}</a></li>`)
    .join("\n");
  const limits = report.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n");
  const shortFingerprint = report.fingerprint.slice(0, 16);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="description" content="Deterministic HubSpot repository migration evidence report.">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(report.pack.title)} — ${escapeHtml(report.repository)}</title>
  <style>
${tokens}
${reportCss}
  </style>
</head>
<body>
  <header class="shell nav-edge">
    <a class="wordmark" href="#top">Patch Lab</a>
    <a class="nav-action" href="#sources">View policy sources →</a>
  </header>
  <main id="top" class="shell">
    <section class="hero">
      <p class="figure" aria-label="${report.summary.findings} evidence items">${report.summary.findings}</p>
      <div class="hero-copy">
        <h1>${escapeHtml(report.pack.title)}</h1>
        <p class="outcome">${escapeHtml(report.outcome)}.</p>
        <p class="qualifier">${report.summary.observed} source-observed · ${report.summary.review} manual-review · ${report.inventory.textFilesScanned} files read</p>
        <p class="metadata"><span>${escapeHtml(report.repository)}</span><span>policy ${escapeHtml(report.pack.policyVersion)}</span><span>as of ${escapeHtml(report.asOf)}</span></p>
      </div>
    </section>

    <section aria-labelledby="summary-title">
      <div class="section-head"><h2 id="summary-title">What the scan found</h2><p>The counts describe this repository and this policy pack. They are not uptime, customer, or Marketplace claims.</p></div>
      <table class="spec-sheet">
        <tbody>
          <tr><th scope="row">Critical</th><td>${report.summary.critical}</td></tr>
          <tr><th scope="row">High</th><td>${report.summary.high}</td></tr>
          <tr><th scope="row">Medium</th><td>${report.summary.medium}</td></tr>
          <tr><th scope="row">Manual review</th><td>${report.summary.review}</td></tr>
        </tbody>
      </table>
    </section>

    <section aria-labelledby="evidence-title">
      <div class="section-head"><h2 id="evidence-title">Repository evidence</h2><p>Each item ties one source location to one published policy. “Review-required” means the source cannot settle the behavior by itself.</p></div>
      <div class="evidence-list">${findings}</div>
    </section>

    <section aria-labelledby="sequence-title">
      <div class="section-head"><h2 id="sequence-title">Safe migration sequence</h2><p>The scanner stops before the steps that can alter a HubSpot account.</p></div>
      <ol class="steps">
        <li><h3>Confirm the source</h3><p>Verify that this repository and branch are the code used for the live app.</p></li>
        <li><h3>Patch in a branch</h3><p>Use the applicable HubSpot migration command, then review generated UIDs, features, secrets, requests, and errors.</p></li>
        <li><h3>Validate before upload</h3><p>Run repository tests, <code>hs project lint</code>, and <code>hs project validate</code>. Upload or deploy only after approval.</p></li>
      </ol>
    </section>

    <section aria-labelledby="limits-title">
      <div class="section-head"><h2 id="limits-title">What this report does not prove</h2><p>A useful proof names its blind spots.</p></div>
      <ul class="limits">${limits}</ul>
    </section>

    <section id="sources" aria-labelledby="sources-title">
      <div class="section-head"><h2 id="sources-title">Policy sources</h2><p>Official HubSpot documentation is the basis for HubSpot migration findings.</p></div>
      <ul class="sources">${sources || "<li>No policy source was used because no finding was emitted.</li>"}</ul>
    </section>
  </main>
  <footer class="shell foot-line"><p>Patch Lab · read-only repository evidence</p><p>fingerprint ${escapeHtml(shortFingerprint)}</p></footer>
</body>
</html>`;
}

export { escapeHtml };
