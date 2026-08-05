import { spawnSync } from "node:child_process";
import test from "node:test";

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function logResult(label, result) {
  console.log(`${label}_BEGIN`);
  console.log(result.stdout || "");
  if (result.stderr) console.log(result.stderr);
  console.log(`${label}_END`);
  if (result.error) throw result.error;
}

test("temporary dependency audit computes the minimal lockfile security fix", () => {
  const before = run("npm", ["audit", "--json"]);
  logResult("DEPENDENCY_AUDIT_BEFORE_JSON", before);

  const fix = run("npm", ["audit", "fix", "--package-lock-only", "--ignore-scripts"]);
  logResult("DEPENDENCY_AUDIT_FIX", fix);
  if (fix.status !== 0) {
    throw new Error(`npm audit fix --package-lock-only failed with status ${fix.status}`);
  }

  const diff = run("git", ["diff", "--", "package-lock.json"]);
  logResult("DEPENDENCY_LOCKFILE_DIFF", diff);
  if (diff.status !== 0) {
    throw new Error(`git diff failed with status ${diff.status}`);
  }

  const after = run("npm", ["audit", "--package-lock-only", "--json"]);
  logResult("DEPENDENCY_AUDIT_AFTER_JSON", after);
  if (after.status !== 0) {
    throw new Error(`security-fixed lockfile still has npm audit findings (status ${after.status})`);
  }

  for (const dependency of ["postcss", "protobufjs", "nanoid"]) {
    const tree = run("npm", ["ls", dependency, "--all", "--json"]);
    logResult(`DEPENDENCY_TREE_${dependency.toUpperCase()}`, tree);
  }
});
