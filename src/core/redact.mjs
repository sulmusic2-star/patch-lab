const SECRET_PATTERNS = [
  /\bpat-[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{8,}\b/g,
  /\bgh[oprsu]_[A-Za-z0-9]{20,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bAIza[A-Za-z0-9_-]{35}\b/g,
  /\bya29\.[A-Za-z0-9_-]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
  /\bBasic\s+[A-Za-z0-9+/=]{12,}\b/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
];

const ASSIGNMENT_PATTERN = /\b([A-Za-z0-9_-]*(?:secret|token|password|passphrase|api[_-]?key|private[_-]?key|hapikey|authorization)[A-Za-z0-9_-]*["']?\s*[:=]\s*["']?)([^"'\s,;}\]]+)/gi;
const URL_USERINFO_PATTERN = /(https?:\/\/[^/\s:@]+:)([^@\s/]+)@/gi;
const URL_QUERY_PATTERN = /([?&](?:access_token|api[_-]?key|auth|authorization|password|secret|token)=)([^&#\s]+)/gi;

export function hasAssignedValue(text) {
  return /(^|\n)\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*[^\s#]+/m.test(text);
}

export function redactText(value, { root = "" } = {}) {
  let output = String(value ?? "");
  if (root) output = output.split(root).join("[REPOSITORY]");
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, "[REDACTED_TOKEN]");
  output = output.replace(ASSIGNMENT_PATTERN, "$1[REDACTED]");
  output = output.replace(URL_USERINFO_PATTERN, "$1[REDACTED]@");
  output = output.replace(URL_QUERY_PATTERN, "$1[REDACTED]");
  return output.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function safeExcerpt(value, options = {}) {
  return redactText(value, options).trim().replace(/\s+/g, " ").slice(0, 240);
}
