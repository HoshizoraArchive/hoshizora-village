import { dispatchAiObservationWorker } from "./aiDispatch.mjs";
import { logAiEvent } from "./aiErrors.mjs";
import { normalizeAiObservationContext } from "./aiObservationContext.mjs";

export async function loadDueAiObservationJobs({
  supabase,
  now = new Date(),
  limit,
}) {
  const { data, error } = await supabase
    .from("ai_observation_jobs")
    .select("id, observation_context, not_before_at")
    .eq("status", "queued")
    .lte("not_before_at", now.toISOString())
    .order("not_before_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    jobId: row.id,
    observationContext: normalizeAiObservationContext(row.observation_context),
    notBeforeAt: row.not_before_at,
  }));
}

export async function dispatchDueAiObservationJobs({
  request,
  supabase,
  config,
  requestId,
  now = new Date(),
}) {
  const dueJobs = await loadDueAiObservationJobs({
    supabase,
    now,
    limit: config.autoObservation.dispatchBatchSize,
  });
  let dispatched = 0;
  let failed = 0;

  for (const job of dueJobs) {
    try {
      await dispatchAiObservationWorker({
        request,
        config,
        jobId: job.jobId,
        observationContext: job.observationContext,
      });
      dispatched += 1;
    } catch (error) {
      failed += 1;
      logAiEvent("warn", "ai_observation_due_dispatch_failed", {
        requestId,
        jobId: job.jobId,
        operation: "ai_observation_dispatch_due",
        status: Number(error?.status ?? 503),
        code: error?.code ?? "WORKER_DISPATCH_FAILED",
      });
    }
  }

  return {
    scanned: dueJobs.length,
    dispatched,
    failed,
  };
}
