import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const netlifyConfig = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");

const EXPECTED_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: https:",
  "media-src 'self' blob: https://dhfecpymvmursozfgjlr.supabase.co https://qskeezefmvnutuzpevbc.supabase.co",
  "connect-src 'self' https://dhfecpymvmursozfgjlr.supabase.co wss://dhfecpymvmursozfgjlr.supabase.co https://qskeezefmvnutuzpevbc.supabase.co wss://qskeezefmvnutuzpevbc.supabase.co",
  "frame-src https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
].join("; ");

const EXPECTED_PERMISSIONS_POLICY = [
  "bluetooth=()",
  "camera=()",
  "display-capture=()",
  "geolocation=()",
  "microphone=()",
  "payment=()",
  "serial=()",
  "usb=()",
  'fullscreen=(self "https://www.youtube-nocookie.com")',
].join(", ");

function readHeader(name) {
  const match = netlifyConfig.match(new RegExp(`^\\s*${name} = ("(?:\\\\.|[^"\\\\])*")$`, "m"));
  return match ? JSON.parse(match[1]) : null;
}

test("Netlify serves the enforced SEC-009 security headers", () => {
  assert.equal(readHeader("Content-Security-Policy"), EXPECTED_CSP);
  assert.equal(readHeader("Permissions-Policy"), EXPECTED_PERMISSIONS_POLICY);
  assert.equal(readHeader("Strict-Transport-Security"), "max-age=31536000");
});

test("CSP does not allow inline scripts or eval and keeps the audited runtime capabilities", () => {
  assert.equal(EXPECTED_CSP.includes("script-src 'self' 'unsafe-inline'"), false);
  assert.equal(EXPECTED_CSP.includes("'unsafe-eval'"), false);
  assert.match(EXPECTED_CSP, /style-src 'self' 'unsafe-inline'/);
  assert.match(EXPECTED_CSP, /img-src 'self' blob: https:/);
  assert.match(EXPECTED_CSP, /worker-src 'self' blob:/);
  assert.match(EXPECTED_CSP, /frame-src https:\/\/www\.youtube-nocookie\.com/);
});

test("HSTS stays reversible and existing compatibility headers remain", () => {
  const hsts = "max-age=31536000";

  assert.equal(hsts.includes("includeSubDomains"), false);
  assert.equal(hsts.includes("preload"), false);
  assert.equal(readHeader("X-Frame-Options"), "DENY");
  assert.equal(readHeader("X-Content-Type-Options"), "nosniff");
  assert.equal(readHeader("Referrer-Policy"), "strict-origin-when-cross-origin");
});
