import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const postCardSource = readFileSync(new URL("./components/PostCard.jsx", import.meta.url), "utf8");
const postComposerSource = readFileSync(new URL("./components/PostComposer.jsx", import.meta.url), "utf8");
const linkedTextSource = readFileSync(new URL("./components/LinkedText.jsx", import.meta.url), "utf8");
const postTextUtilsSource = readFileSync(new URL("./lib/postTextUtils.js", import.meta.url), "utf8");

function verifyPostComponentImports(app = appSource) {
  assert.match(app, /import\s*\{\s*PostCard\s*\}\s*from\s*["']\.\/components\/PostCard["']/);
  assert.match(app, /import\s*\{\s*Composer\s*,\s*METEOR_COMPOSER_FORM_ID\s*\}\s*from\s*["']\.\/components\/PostComposer["']/);
  assert.match(app, /import\s*\{\s*LinkedText\s*\}\s*from\s*["']\.\/components\/LinkedText["']/);
  assert.match(app, /import\s*\{[^}]*getTrimmedCharacterLength[^}]*\}\s*from\s*["']\.\/lib\/postTextUtils["']/s);
}

test("App imports the extracted components and uses the imported elements on active routes", () => {
  verifyPostComponentImports();
  assert.ok((appSource.match(/<PostCard\b/g) ?? []).length >= 6);
  assert.match(appSource, /<Composer\s+composer=\{composer\}\s*\/>/);
  assert.match(appSource, /\bMETEOR_COMPOSER_FORM_ID\b/);
});

test("source contract fails if the PostCard module binding is removed", () => {
  assert.throws(() => verifyPostComponentImports(appSource.replace(/import\s*\{\s*PostCard\s*\}\s*from\s*["']\.\/components\/PostCard["'];?/, "")), /PostCard/);
});

test("PostCard owns the card actions and explicitly wires the star-letter subtree", () => {
  assert.match(postCardSource, /import\s*\{\s*MeteorTagTextarea\s*\}\s*from\s*["']\.\/PostComposer["']/);
  assert.match(postCardSource, /import\s*\{\s*LinkedText\s*\}\s*from\s*["']\.\/LinkedText["']/);
  const card = postCardSource.split("function PostCard(")[1]?.split("function StarLettersPanel(")[0];
  assert.ok(card, "PostCard definition is present");
  for (const token of ["<ActionButton", "<StarLettersPanel", "<PostMediaGrid", "<LinkedText", "<MeteorTagTextarea", "onToggleArchive", "onResonate", "onUpdate", "onDelete"]) {
    assert.ok(card.includes(token), `PostCard lost the ${token} integration`);
  }
  const letterPanel = postCardSource.split("function StarLettersPanel(")[1]?.split("function StarLetterItem(")[0];
  assert.ok(letterPanel?.includes("buildStarLetterThreadRows(letters)"));
  assert.ok(postCardSource.includes("function StarLetterItem("));
});

test("Composer and LinkedText modules keep explicit UI and parsing dependencies", () => {
  assert.match(postComposerSource, /import\s*\{\s*LinkedText\s*\}\s*from\s*["']\.\/LinkedText["']/);
  assert.match(postComposerSource, /import\s*\{[^}]*PostImageDraftPreview[^}]*PostVideoDraftPreview[^}]*PostThumbnailDraftPreview[^}]*\}\s*from\s*["']\.\/MediaDraftPreviews["']/);
  assert.match(postComposerSource, /<MeteorTagTextarea\b/);
  assert.match(postComposerSource, /<PostImageDraftPreview\b/);
  assert.match(postComposerSource, /<PostVideoDraftPreview\b/);
  assert.match(linkedTextSource, /from\s*["']\.\.\/lib\/postTextUtils["']/);
  assert.match(postTextUtilsSource, /function validateMeteorTagsFromText\(/);
  assert.match(postTextUtilsSource, /function findFirstYouTubeVideoId\(/);
  assert.match(postTextUtilsSource, /function findFirstSunoUrl\(/);
});
