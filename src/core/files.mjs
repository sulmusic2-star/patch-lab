import { execFile } from "node:child_process";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_SKIP_DIRS = new Set([
  ".git", ".hg", ".next", ".nuxt", ".output", ".svelte-kit", ".turbo", ".wrangler",
  "build", "coverage", "dist", "node_modules", "target", "vendor",
]);

export async function collectTextFiles(root, selection = {}) {
  const absoluteRoot = path.resolve(root);
  const rootInfo = await stat(absoluteRoot);
  if (!rootInfo.isDirectory()) throw new Error(`Repository path is not a directory: ${absoluteRoot}`);

  const extensions = new Set(selection.extensions ?? []);
  const filenames = new Set(selection.filenames ?? []);
  const namePrefixes = selection.namePrefixes ?? [];
  const skipDirs = new Set([...DEFAULT_SKIP_DIRS, ...(selection.skipDirs ?? [])]);
  const maxFileBytes = selection.maxFileBytes ?? 1_000_000;
  const maxTotalBytes = selection.maxTotalBytes ?? 64 * 1024 * 1024;
  const maxFiles = selection.maxFiles ?? 25_000;
  const files = [];
  const errors = [];
  let skippedLarge = 0;
  let skippedBinary = 0;
  let totalBytes = 0;

  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      errors.push({ path: toRelative(absoluteRoot, current), reason: error.code ?? "READ_ERROR" });
      return;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= maxFiles) return;
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) await walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (!filenames.has(entry.name) && !namePrefixes.some((prefix) => entry.name.startsWith(prefix)) && !extensions.has(extension)) continue;
      let info;
      try {
        info = await stat(absolute);
      } catch (error) {
        errors.push({ path: toRelative(absoluteRoot, absolute), reason: error.code ?? "STAT_ERROR" });
        continue;
      }
      if (info.size > maxFileBytes) {
        skippedLarge += 1;
        continue;
      }
      const buffer = await readFile(absolute);
      if (buffer.length > maxFileBytes) {
        skippedLarge += 1;
        continue;
      }
      if (buffer.includes(0)) {
        skippedBinary += 1;
        continue;
      }
      if (totalBytes + buffer.length > maxTotalBytes) {
        throw new Error(`Repository text selection exceeds the ${maxTotalBytes}-byte cumulative limit.`);
      }
      totalBytes += buffer.length;
      files.push({
        absolute,
        relative: toRelative(absoluteRoot, absolute),
        name: entry.name,
        extension,
        size: info.size,
        text: buffer.toString("utf8"),
      });
    }
  }

  await walk(absoluteRoot);
  return { absoluteRoot, files, errors, skippedLarge, skippedBinary, totalBytes, hitFileLimit: files.length >= maxFiles };
}

export async function trackedFileSet(root) {
  try {
    const { stdout: topLevelOutput } = await execFileAsync("git", ["-C", root, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
    });
    const topLevel = await realpath(topLevelOutput.trim());
    const canonicalRoot = await realpath(root);
    const relativeRoot = path.relative(topLevel, canonicalRoot).split(path.sep).join("/");
    const args = ["-C", topLevel, "ls-files", "-z"];
    if (relativeRoot) args.push("--", relativeRoot);
    const { stdout } = await execFileAsync("git", args, {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 10_000,
    });
    return new Set(stdout.split("\0").filter(Boolean).map((item) => {
      const normalized = item.split(path.sep).join("/");
      return relativeRoot ? path.posix.relative(relativeRoot, normalized) : normalized;
    }).filter((item) => item && !item.startsWith("../")));
  } catch {
    return null;
  }
}

export function toRelative(root, absolute) {
  const relative = path.relative(root, absolute).split(path.sep).join("/");
  return relative || ".";
}
