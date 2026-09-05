const EXACT_PUSH_SERVICE_HOSTS = new Map([
  ["fcm.googleapis.com", "fcm"],
  // Legacy Chromium subscriptions can still surface the pre-FCM GCM host.
  ["android.googleapis.com", "fcm"],
]);

const PUSH_SERVICE_SUFFIXES = [
  { root: "push.services.mozilla.com", service: "mozilla" },
  { root: "push.apple.com", service: "apple" },
  { root: "notify.windows.com", service: "microsoft" },
];

function matchesHostOrSubdomain(hostname, root) {
  return hostname === root || hostname.endsWith(`.${root}`);
}

export function getAllowedPushServiceKind(endpoint) {
  if (typeof endpoint !== "string") {
    return null;
  }

  let parsed;

  try {
    parsed = new URL(endpoint);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== "443")
  ) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const exactService = EXACT_PUSH_SERVICE_HOSTS.get(hostname);

  if (exactService) {
    return exactService;
  }

  for (const { root, service } of PUSH_SERVICE_SUFFIXES) {
    if (matchesHostOrSubdomain(hostname, root)) {
      return service;
    }
  }

  return null;
}

export function isAllowedPushServiceEndpoint(endpoint) {
  return getAllowedPushServiceKind(endpoint) !== null;
}
