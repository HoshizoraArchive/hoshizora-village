import {
  pushJsonResponse,
  readVapidPublicKey,
} from "./_shared/pushNotifications.mjs";

export default async function handler(request) {
  if (request.method !== "GET") {
    return pushJsonResponse(405, {
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "この操作は許可されていません。",
      },
    });
  }

  const publicKey = readVapidPublicKey();

  return pushJsonResponse(200, {
    enabled: Boolean(publicKey),
    publicKey,
  });
}

export const config = {
  path: "/api/push-config",
  method: ["GET"],
};
