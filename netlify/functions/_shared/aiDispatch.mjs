import { AI_ERROR, aiHttpError } from "./aiErrors.mjs";
import { signWorkerDispatch } from "./aiWorkerDispatch.mjs";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";

export async function dispatchAiObservationWorker({
  request,
  config,
  jobId,
  observationContext = AI_OBSERVATION_CONTEXT.MANUAL,
}) {
  const workerUrl = new URL("/api/ai-observation-worker", request.url);
  const dispatchPayload = signWorkerDispatch({
    jobId,
    secret: config.workerSharedSecret,
    observationContext,
  });
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(dispatchPayload),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw aiHttpError(429, AI_ERROR.RATE_LIMITED);
    }

    throw aiHttpError(503, AI_ERROR.WORKER_DISPATCH_FAILED);
  }
}
