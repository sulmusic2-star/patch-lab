const LINE_BREAKS = /[\r\n\u2028\u2029]+/g;
const CONTROLS = /[\u0000-\u001F\u007F]/g;
const MARKDOWN_PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;

export function markdownText(value) {
  return String(value ?? "")
    .replace(LINE_BREAKS, " ")
    .replace(CONTROLS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(MARKDOWN_PUNCTUATION, "\\$&");
}

export function markdownUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (!new Set(["https:", "http:"]).has(url.protocol)) return null;
    return url.href.replaceAll("(", "%28").replaceAll(")", "%29");
  } catch {
    return null;
  }
}

export function markdownLink(label, url) {
  const text = markdownText(label);
  const target = markdownUrl(url);
  return target ? `[${text}](${target})` : text;
}
