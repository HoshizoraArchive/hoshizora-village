import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const asset = path.join(root, 'public/images/hoshizora-village-background-desktop.webp');
const expectedSha256 = '24c1879889f506fe22ebc8e747cde955a7a5d88e99e85ca2c042db8922eb0b5d';

test('desktop background is the exact verified 1536x864 native WebP', async () => {
  const bytes = await readFile(asset);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedSha256);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'RIFF declared length must match');
  assert.equal(bytes.toString('ascii', 12, 16), 'VP8 ');
  assert.equal(bytes.toString('hex', 23, 26), '9d012a');
  assert.equal(bytes.readUInt16LE(26) & 0x3fff, 1536);
  assert.equal(bytes.readUInt16LE(28) & 0x3fff, 864);
});

test('PC applies the landscape background while phone/tablet retain the original image', async () => {
  const css = await readFile(path.join(root, 'src/villageBackgroundArt.css'), 'utf8');
  assert.match(css, /@media \(max-width: 1023px\)\s*\{[\s\S]*?hoshizora-village-background-current\.webp\?v=20260803-bg75-integrity/);
  assert.match(css, /@media \(min-width: 1024px\)\s*\{[\s\S]*?hoshizora-village-background-desktop\.webp\?v=20261105-desktop-source-verified/);
  const mobile = css.match(/@media \(max-width: 1023px\)\s*\{([\s\S]*?)\n\}\n/);
  assert.ok(mobile);
  assert.doesNotMatch(mobile[1], /desktop\.webp/);
});
