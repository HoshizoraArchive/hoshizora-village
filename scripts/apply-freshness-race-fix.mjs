import { readFileSync, writeFileSync } from "node:fs";

const path = "src/App.jsx";
let source = readFileSync(path, "utf8");
const from = `  const refreshObserveTimeline = useCallback(\n    async ({ scrollToTop = false } = {}) => {\n      const refreshed = await refreshPublicPosts();\n\n      if (!refreshed) {\n        return false;\n      }\n\n      setServerDataRevision((current) => current + 1);\n      setTimelineHasNewPosts(false);`;
const to = `  const refreshObserveTimeline = useCallback(\n    async ({ scrollToTop = false } = {}) => {\n      // Related card data must refresh even if the public-post request is already\n      // in flight or fails. New post ids still trigger their own dependent reads.\n      setServerDataRevision((current) => current + 1);\n      const refreshed = await refreshPublicPosts();\n\n      if (!refreshed) {\n        return false;\n      }\n\n      setTimelineHasNewPosts(false);`;

const first = source.indexOf(from);
if (first === -1 || source.indexOf(from, first + from.length) !== -1) {
  throw new Error("refreshObserveTimeline replacement target missing or non-unique");
}
source = `${source.slice(0, first)}${to}${source.slice(first + from.length)}`;
writeFileSync(path, source);
console.log("Moved related-card revision ahead of public-post refresh");
