// Temporary, read-only production runtime attestation for the 2026-10-21
// Node.js security release. Remove immediately after verification.
export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response(null, { status: 404 });
  }

  const version = process.versions.node;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  const supported = Boolean(match) && Number(match[1]) === 22;
  const patched = supported && (
    Number(match[2]) > 23 ||
    (Number(match[2]) === 23 && Number(match[3]) >= 4)
  );

  return new Response(JSON.stringify({
    runtime: "nodejs22.x",
    version,
    patched,
  }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}

export const config = {
  path: "/__security-runtime-check-20261023-7e6ef9dc",
  method: ["POST"],
};
