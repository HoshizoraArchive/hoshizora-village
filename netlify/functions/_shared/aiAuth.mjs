import { AI_ERROR, aiHttpError } from "./aiErrors.mjs";

export function extractBearerToken(request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9._~+/=-]+)$/);

  return match?.[1] ?? "";
}

export async function requireAiOperator({ request, supabase, config }) {
  const token = extractBearerToken(request);

  if (!token) {
    throw aiHttpError(401, AI_ERROR.INVALID_TOKEN);
  }

  const { data, error } = await supabase.auth.getUser(token);
  const userId = data?.user?.id?.toLowerCase();

  if (error || !userId) {
    throw aiHttpError(401, AI_ERROR.INVALID_TOKEN);
  }

  if (!config.operatorUserIds.has(userId)) {
    throw aiHttpError(403, AI_ERROR.FORBIDDEN);
  }

  return {
    id: userId,
  };
}
