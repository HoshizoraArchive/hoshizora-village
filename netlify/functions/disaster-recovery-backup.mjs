import { getStore } from "@netlify/blobs";
import { createSupabaseAdminClient } from "./_shared/supabaseAdmin.mjs";
import {
  DISASTER_RECOVERY_RETENTION_COUNT,
  DISASTER_RECOVERY_RUNS_PREFIX,
  DISASTER_RECOVERY_STATE_KEY,
  DISASTER_RECOVERY_STORE_NAME,
  createDatabaseBackupKey,
  createDisasterRecoveryRunId,
  createManifestKey,
  createStorageBackupKey,
  getExpiredBackupRunIds,
  selectStorageRestoreVerificationSample,
  sha256Hex,
  shouldStartDisasterRecoveryBackup,
} from "./_shared/disasterRecovery.mjs";

const LATEST_BACKUP_KEY = "_control/latest.json";

function readBackupConfig() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (process.env.CONTEXT !== "production") {
    throw new Error("disaster_recovery_production_only");
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("disaster_recovery_missing_supabase_config");
  }

  return { supabaseUrl, supabaseServiceRoleKey };
}

async function listBucketFiles(storage, bucketName, path = "") {
  const files = [];
  let offset = 0;

  while (true) {
    const { data, error } = await storage.from(bucketName).list(path, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(`disaster_recovery_storage_list_failed:${bucketName}`);
    }

    const rows = Array.isArray(data) ? data : [];

    for (const item of rows) {
      const fullPath = path ? `${path}/${item.name}` : item.name;

      if (!item.metadata) {
        files.push(...(await listBucketFiles(storage, bucketName, fullPath)));
        continue;
      }

      files.push({
        bucketName,
        objectPath: fullPath,
        sizeBytes: Number(item.metadata?.size ?? 0),
        mimeType: item.metadata?.mimetype ?? null,
        cacheControl: item.metadata?.cacheControl ?? null,
      });
    }

    if (rows.length < 1000) {
      break;
    }

    offset += rows.length;
  }

  return files;
}

async function readJson(store, key) {
  return store.get(key, { type: "json" });
}

async function initializeBackupRun({ store, supabase, now }) {
  const runId = createDisasterRecoveryRunId(now);
  const databaseBlobKey = createDatabaseBackupKey(runId);
  const manifestKey = createManifestKey(runId);

  const { data: databaseSnapshot, error: snapshotError } = await supabase.rpc(
    "create_disaster_recovery_snapshot",
  );

  if (snapshotError || !databaseSnapshot) {
    throw new Error("disaster_recovery_database_snapshot_failed");
  }

  await store.setJSON(databaseBlobKey, databaseSnapshot);

  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  if (bucketsError) {
    throw new Error("disaster_recovery_bucket_list_failed");
  }

  const bucketRows = Array.isArray(buckets) ? buckets : [];
  const storageObjects = [];

  for (const bucket of bucketRows) {
    const files = await listBucketFiles(supabase.storage, bucket.name);

    for (const file of files) {
      storageObjects.push({
        ...file,
        blobKey: createStorageBackupKey(runId, file.bucketName, file.objectPath),
        completed: false,
        sha256: null,
      });
    }
  }

  const manifest = {
    version: 1,
    runId,
    startedAt: now.toISOString(),
    completedAt: null,
    commitRef: process.env.COMMIT_REF ?? null,
    database: {
      blobKey: databaseBlobKey,
      restoreVerified: false,
    },
    storage: {
      buckets: bucketRows.map((bucket) => ({
        id: bucket.id,
        name: bucket.name,
        public: bucket.public === true,
        fileSizeLimit: bucket.file_size_limit ?? null,
        allowedMimeTypes: bucket.allowed_mime_types ?? null,
      })),
      objects: storageObjects,
      totalBytes: storageObjects.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0),
      restoreVerified: false,
    },
    restoreVerification: null,
  };

  await store.setJSON(manifestKey, manifest);

  const state = {
    activeRunId: runId,
    nextObjectIndex: 0,
    lastCompletedAt: null,
    lastError: null,
  };

  await store.setJSON(DISASTER_RECOVERY_STATE_KEY, state);
  return { state, manifest };
}

async function backupNextStorageObject({ store, supabase, manifest, state }) {
  const index = Number(state.nextObjectIndex ?? 0);
  const item = manifest.storage.objects[index];

  if (!item) {
    return { manifest, state, copied: false };
  }

  const { data, error } = await supabase.storage.from(item.bucketName).download(item.objectPath);
  if (error || !data) {
    throw new Error("disaster_recovery_storage_download_failed");
  }

  const bytes = await data.arrayBuffer();
  const sourceSha256 = sha256Hex(Buffer.from(bytes));
  await store.set(item.blobKey, bytes);

  const storedBytes = await store.get(item.blobKey, { type: "arrayBuffer" });
  if (!storedBytes || sha256Hex(Buffer.from(storedBytes)) !== sourceSha256) {
    throw new Error("disaster_recovery_blob_checksum_failed");
  }

  manifest.storage.objects[index] = {
    ...item,
    sizeBytes: bytes.byteLength,
    completed: true,
    sha256: sourceSha256,
  };
  state.nextObjectIndex = index + 1;

  await store.setJSON(createManifestKey(manifest.runId), manifest);
  await store.setJSON(DISASTER_RECOVERY_STATE_KEY, state);

  return { manifest, state, copied: true };
}

async function verifyDatabaseRestoreRoundTrip({ store, supabase, manifest }) {
  const snapshot = await readJson(store, manifest.database.blobKey);
  if (!snapshot) {
    throw new Error("disaster_recovery_database_blob_missing");
  }

  const { data, error } = await supabase.rpc("verify_disaster_recovery_snapshot", {
    p_snapshot: snapshot,
  });

  if (error || data?.ok !== true) {
    throw new Error("disaster_recovery_database_restore_verification_failed");
  }

  return data;
}

async function verifyStorageRestoreRoundTrip({ store, supabase, manifest }) {
  const sample = selectStorageRestoreVerificationSample(manifest.storage.objects);
  if (!sample) {
    return { ok: true, skipped: true, reason: "no_storage_objects" };
  }

  const bytes = await store.get(sample.blobKey, { type: "arrayBuffer" });
  if (!bytes || sha256Hex(Buffer.from(bytes)) !== sample.sha256) {
    throw new Error("disaster_recovery_storage_backup_read_failed");
  }

  const verificationBucket = `dr-restore-${sha256Hex(manifest.runId).slice(0, 12)}`;
  const verificationPath = "verification-object";
  let bucketCreated = false;

  try {
    const { error: createError } = await supabase.storage.createBucket(verificationBucket, {
      public: false,
    });

    if (createError) {
      throw new Error("disaster_recovery_verification_bucket_create_failed");
    }
    bucketCreated = true;

    const { error: uploadError } = await supabase.storage
      .from(verificationBucket)
      .upload(verificationPath, bytes, {
        contentType: sample.mimeType ?? "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      throw new Error("disaster_recovery_verification_upload_failed");
    }

    const { data: restoredData, error: downloadError } = await supabase.storage
      .from(verificationBucket)
      .download(verificationPath);

    if (downloadError || !restoredData) {
      throw new Error("disaster_recovery_verification_download_failed");
    }

    const restoredBytes = await restoredData.arrayBuffer();
    if (sha256Hex(Buffer.from(restoredBytes)) !== sample.sha256) {
      throw new Error("disaster_recovery_storage_restore_checksum_failed");
    }

    return {
      ok: true,
      skipped: false,
      sizeBytes: restoredBytes.byteLength,
      sha256: sample.sha256,
    };
  } finally {
    if (bucketCreated) {
      await supabase.storage.from(verificationBucket).remove([verificationPath]).catch(() => undefined);
      await supabase.storage.deleteBucket(verificationBucket).catch(() => undefined);
    }
  }
}

async function deleteExpiredBackups(store, activeRunId) {
  const listing = await store.list({ prefix: DISASTER_RECOVERY_RUNS_PREFIX });
  const allKeys = listing.blobs.map((blob) => blob.key);
  const expiredRunIds = getExpiredBackupRunIds(allKeys, DISASTER_RECOVERY_RETENTION_COUNT).filter(
    (runId) => runId !== activeRunId,
  );

  for (const runId of expiredRunIds) {
    const runListing = await store.list({ prefix: `${DISASTER_RECOVERY_RUNS_PREFIX}${runId}/` });
    await Promise.all(runListing.blobs.map((blob) => store.delete(blob.key)));
  }
}

async function finalizeBackup({ store, supabase, manifest, state, now }) {
  const databaseVerification = await verifyDatabaseRestoreRoundTrip({ store, supabase, manifest });
  const storageVerification = await verifyStorageRestoreRoundTrip({ store, supabase, manifest });

  manifest.completedAt = now.toISOString();
  manifest.database.restoreVerified = true;
  manifest.storage.restoreVerified = storageVerification.ok === true;
  manifest.restoreVerification = {
    verifiedAt: now.toISOString(),
    database: databaseVerification,
    storage: storageVerification,
  };

  await store.setJSON(createManifestKey(manifest.runId), manifest);
  await store.setJSON(LATEST_BACKUP_KEY, {
    runId: manifest.runId,
    completedAt: manifest.completedAt,
    databaseRestoreVerified: manifest.database.restoreVerified,
    storageRestoreVerified: manifest.storage.restoreVerified,
    storageObjectCount: manifest.storage.objects.length,
    storageTotalBytes: manifest.storage.totalBytes,
  });

  const completedState = {
    activeRunId: null,
    nextObjectIndex: 0,
    lastCompletedAt: manifest.completedAt,
    lastError: null,
  };
  await store.setJSON(DISASTER_RECOVERY_STATE_KEY, completedState);
  await deleteExpiredBackups(store, null);

  return completedState;
}

export default async function handler() {
  let store;

  try {
    const config = readBackupConfig();
    const supabase = createSupabaseAdminClient(config);
    store = getStore(DISASTER_RECOVERY_STORE_NAME, { consistency: "strong" });
    const now = new Date();
    let state = (await readJson(store, DISASTER_RECOVERY_STATE_KEY)) ?? {
      activeRunId: null,
      nextObjectIndex: 0,
      lastCompletedAt: null,
      lastError: null,
    };

    let manifest = null;

    if (!state.activeRunId) {
      if (!shouldStartDisasterRecoveryBackup(state, now)) {
        return new Response(null, { status: 204 });
      }

      ({ state, manifest } = await initializeBackupRun({ store, supabase, now }));
      return new Response(null, { status: 204 });
    }

    manifest = await readJson(store, createManifestKey(state.activeRunId));
    if (!manifest) {
      throw new Error("disaster_recovery_manifest_missing");
    }

    if (Number(state.nextObjectIndex ?? 0) < manifest.storage.objects.length) {
      await backupNextStorageObject({ store, supabase, manifest, state });
      return new Response(null, { status: 204 });
    }

    await finalizeBackup({ store, supabase, manifest, state, now });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (store) {
      const currentState = (await readJson(store, DISASTER_RECOVERY_STATE_KEY).catch(() => null)) ?? {};
      await store
        .setJSON(DISASTER_RECOVERY_STATE_KEY, {
          ...currentState,
          lastError: error instanceof Error ? error.message : "disaster_recovery_unknown_error",
        })
        .catch(() => undefined);
    }

    console.error("[disaster-recovery] backup slice failed", {
      code: error instanceof Error ? error.message : "disaster_recovery_unknown_error",
    });
    return new Response(null, { status: 500 });
  }
}

export const config = {
  schedule: "*/1 * * * *",
};
