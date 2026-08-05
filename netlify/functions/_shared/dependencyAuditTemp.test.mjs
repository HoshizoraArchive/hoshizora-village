import { spawnSync } from "node:child_process";
import test from "node:test";

test("temporary dependency audit emits the full npm audit report", () => {
  const result = spawnSync("npm", ["audit", "--json"], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  console.log("DEPENDENCY_AUDIT_JSON_BEGIN");
  console.log(result.stdout || "{}");
  if (result.stderr) console.log(result.stderr);
  console.log("DEPENDENCY_AUDIT_JSON_END");

  if (result.error) throw result.error;
});
