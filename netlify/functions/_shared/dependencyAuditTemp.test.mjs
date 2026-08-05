import { spawnSync } from "node:child_process";
import test from "node:test";

function runNpm(args) {
  return spawnSync("npm", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

test("temporary dependency audit emits advisory and dependency-path details", () => {
  const audit = runNpm(["audit", "--json"]);
  console.log("DEPENDENCY_AUDIT_JSON_BEGIN");
  console.log(audit.stdout || "{}");
  if (audit.stderr) console.log(audit.stderr);
  console.log("DEPENDENCY_AUDIT_JSON_END");
  if (audit.error) throw audit.error;

  for (const dependency of ["postcss", "protobufjs"]) {
    const tree = runNpm(["ls", dependency, "--all", "--json"]);
    console.log(`DEPENDENCY_TREE_${dependency.toUpperCase()}_BEGIN`);
    console.log(tree.stdout || "{}");
    if (tree.stderr) console.log(tree.stderr);
    console.log(`DEPENDENCY_TREE_${dependency.toUpperCase()}_END`);
    if (tree.error) throw tree.error;
  }
});
