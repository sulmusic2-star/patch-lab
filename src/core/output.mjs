import { randomBytes } from "node:crypto";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function rejectRelativeSymlinkComponents(cwd, parent) {
  const relative = path.relative(cwd, parent);
  let current = cwd;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`Output path contains a symbolic link: ${current}`);
      if (!info.isDirectory()) throw new Error(`Output parent is not a directory: ${current}`);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
  }
}

export async function writeTextOutput(requestedPath, content, { cwd = process.cwd() } = {}) {
  const requested = String(requestedPath);
  const relativeRequest = !path.isAbsolute(requested);
  const lexicalCwd = path.resolve(cwd);
  const destination = path.resolve(lexicalCwd, requested);
  const parent = path.dirname(destination);

  if (relativeRequest) {
    if (!isWithin(lexicalCwd, destination)) throw new Error("A relative output path must stay inside the current directory.");
    await rejectRelativeSymlinkComponents(lexicalCwd, parent);
  }

  await mkdir(parent, { recursive: true, mode: 0o700 });
  const realParent = await realpath(parent);
  if (relativeRequest) {
    const realCwd = await realpath(lexicalCwd);
    if (!isWithin(realCwd, realParent)) throw new Error("A relative output path resolves outside the current directory.");
  }

  const finalPath = path.join(realParent, path.basename(destination));
  try {
    const existing = await lstat(finalPath);
    if (existing.isSymbolicLink() || !existing.isFile()) throw new Error("Output destination must be a regular file or not exist.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const temporary = path.join(realParent, `.patch-lab-${process.pid}-${randomBytes(12).toString("hex")}.tmp`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(String(content), { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, finalPath);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  return destination;
}
