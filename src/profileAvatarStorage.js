const AVATAR_PUBLIC_PATH_PREFIX = "/storage/v1/object/public/avatars/";
const MANAGED_AVATAR_FILE_PATTERN = /^(?:avatar-cropped-\d+\.jpg|avatar-\d+\.(?:jpg|jpeg|png|webp))$/;

export const PROFILE_AVATAR_CONFLICT_CODE = "PROFILE_AVATAR_CONFLICT";

function parseOwnedManagedAvatarUrl(avatarUrl, userId) {
  if (!avatarUrl || !userId) {
    return null;
  }

  try {
    const url = new URL(avatarUrl);

    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith(AVATAR_PUBLIC_PATH_PREFIX)
    ) {
      return null;
    }

    const encodedPath = url.pathname.slice(AVATAR_PUBLIC_PATH_PREFIX.length);
    const encodedSegments = encodedPath.split("/");

    if (encodedSegments.length !== 2) {
      return null;
    }

    const [ownerFolder, fileName] = encodedSegments.map((segment) => decodeURIComponent(segment));

    if (
      ownerFolder !== userId ||
      ownerFolder.includes("/") ||
      fileName.includes("/") ||
      !MANAGED_AVATAR_FILE_PATTERN.test(fileName)
    ) {
      return null;
    }

    return {
      origin: url.origin,
      path: `${ownerFolder}/${fileName}`,
    };
  } catch {
    return null;
  }
}

export function getOwnedAvatarStoragePath({ avatarUrl, referenceUrl, userId }) {
  const avatar = parseOwnedManagedAvatarUrl(avatarUrl, userId);
  const reference = parseOwnedManagedAvatarUrl(referenceUrl, userId);

  if (!avatar || !reference || avatar.origin !== reference.origin) {
    return null;
  }

  return avatar.path;
}

function createProfileAvatarConflictError() {
  const error = new Error("The profile avatar changed before this save completed.");
  error.code = PROFILE_AVATAR_CONFLICT_CODE;
  return error;
}

export async function saveProfileWithAvatarGuard({
  expectedAvatarUrl,
  profileExists,
  profilePayload,
  selectColumns,
  supabase,
}) {
  if (!profileExists) {
    return supabase.from("profiles").insert(profilePayload).select(selectColumns).single();
  }

  let query = supabase.from("profiles").update(profilePayload).eq("id", profilePayload.id);
  query = expectedAvatarUrl === null
    ? query.is("avatar_url", null)
    : query.eq("avatar_url", expectedAvatarUrl);

  const result = await query.select(selectColumns).maybeSingle();

  if (!result.error && !result.data) {
    return {
      data: null,
      error: createProfileAvatarConflictError(),
    };
  }

  return result;
}

async function removeAvatarSafely(removeAvatar, path) {
  try {
    const result = await removeAvatar(path);
    return result?.error ?? null;
  } catch (error) {
    return error;
  }
}

export async function runProfileSaveWithAvatarLifecycle({
  previousAvatarPath = null,
  removeAvatar,
  removePreviousAvatar = false,
  saveProfile,
  uploadAvatar = null,
}) {
  let uploadedAvatar = null;

  if (uploadAvatar) {
    let uploadResult;

    try {
      uploadResult = await uploadAvatar();
    } catch (error) {
      return { cleanupError: null, data: null, error, stage: "upload", uploadedAvatar: null };
    }

    if (uploadResult?.error) {
      return {
        cleanupError: null,
        data: null,
        error: uploadResult.error,
        stage: "upload",
        uploadedAvatar: null,
      };
    }

    uploadedAvatar = {
      path: uploadResult.path,
      publicUrl: uploadResult.publicUrl,
    };
  }

  let profileResult;

  try {
    profileResult = await saveProfile(uploadedAvatar?.publicUrl ?? null);
  } catch (error) {
    profileResult = { data: null, error };
  }

  if (profileResult?.error) {
    const cleanupError = uploadedAvatar?.path
      ? await removeAvatarSafely(removeAvatar, uploadedAvatar.path)
      : null;

    return {
      cleanupError,
      data: null,
      error: profileResult.error,
      stage: "profile",
      uploadedAvatar,
    };
  }

  const shouldRemovePrevious =
    removePreviousAvatar &&
    previousAvatarPath &&
    previousAvatarPath !== uploadedAvatar?.path;
  const cleanupError = shouldRemovePrevious
    ? await removeAvatarSafely(removeAvatar, previousAvatarPath)
    : null;

  return {
    cleanupError,
    data: profileResult?.data ?? null,
    error: null,
    stage: null,
    uploadedAvatar,
  };
}
