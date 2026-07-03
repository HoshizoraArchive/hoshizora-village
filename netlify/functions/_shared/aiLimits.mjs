export function getUtcPeriodStarts(now = new Date()) {
  return {
    dayStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  };
}

export function buildReservationParams({ config, mediaSummary }) {
  return {
    inputKind: mediaSummary.inputKind,
    inputSizeBytes: mediaSummary.inputSizeBytes,
    inputDurationSeconds: mediaSummary.inputDurationSeconds,
    reservedCostMicroUsd: config.reservedCostMicroUsd,
    maxAttempts: Math.max(1, config.maxRetries + 1),
  };
}

export function getBillableCostMicroUsd(job) {
  const reservedCost = Number(job?.reserved_cost_micro_usd ?? 0);
  const actualCost = job?.actual_cost_micro_usd === null || job?.actual_cost_micro_usd === undefined
    ? null
    : Number(job.actual_cost_micro_usd);
  const attemptCount = Number(job?.attempt_count ?? 0);

  if (!Number.isSafeInteger(reservedCost) || reservedCost < 0) {
    return 0;
  }

  if (job?.status === "queued" || job?.status === "processing") {
    return reservedCost;
  }

  if (job?.status === "succeeded") {
    return Number.isSafeInteger(actualCost) && actualCost >= 0 ? actualCost : reservedCost;
  }

  if (job?.status === "failed" && attemptCount > 0) {
    return Number.isSafeInteger(actualCost) && actualCost >= 0 ? actualCost : reservedCost;
  }

  return 0;
}

export function canStartProviderAttempt(job) {
  const attemptCount = Number(job?.attempt_count);
  const maxAttempts = Number(job?.max_attempts);

  return (
    job?.status === "processing" &&
    Number.isInteger(attemptCount) &&
    Number.isInteger(maxAttempts) &&
    attemptCount >= 0 &&
    maxAttempts >= 1 &&
    attemptCount < maxAttempts
  );
}

export function isRetriableProviderFailure(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

export async function withTimeout(task, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

export async function retryTransient(task, { maxRetries, timeoutMs, shouldRetry = isRetriableProviderFailure }) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await withTimeout(task, timeoutMs);
    } catch (error) {
      lastError = error;

      if (!shouldRetry(Number(error?.status)) || attempt >= maxRetries) {
        break;
      }
    }
  }

  throw lastError;
}
