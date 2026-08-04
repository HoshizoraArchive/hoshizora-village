import { readFileSync, writeFileSync } from "node:fs";

const path = "src/App.jsx";
let source = readFileSync(path, "utf8");

const importFrom = 'import { APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS, shouldRefreshAfterForeground } from "./appDataFreshness";';
const importTo = `import {\n  APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS,\n  preservePostResonanceCounts,\n  shouldRefreshAfterForeground,\n} from "./appDataFreshness";`;

if (!source.includes(importFrom)) {
  throw new Error("appDataFreshness import target not found");
}
source = source.replace(importFrom, importTo);

const setterFrom = `        setSavedPosts(\n          hydratedPosts.filter(\n            (post) => !isProfileBlocked(blockedProfileIdsRef.current, post.authorId),\n          ),\n        );`;
const setterTo = `        const visiblePosts = hydratedPosts.filter(\n          (post) => !isProfileBlocked(blockedProfileIdsRef.current, post.authorId),\n        );\n        setSavedPosts((currentPosts) => preservePostResonanceCounts(currentPosts, visiblePosts));`;

if (!source.includes(setterFrom)) {
  throw new Error("refreshPublicPosts setter target not found");
}
source = source.replace(setterFrom, setterTo);

writeFileSync(path, source);
console.log("Applied resonance refresh race fix to src/App.jsx");
