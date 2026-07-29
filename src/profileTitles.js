export const PROFILE_TITLES_RELATION_SELECT =
  "profile_titles(is_primary, granted_at, title:titles(id, key, label, description, variant, emblem_path, is_active, sort_order))";

function readRelatedTitle(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function normalizeProfileTitles(assignments) {
  return (assignments ?? [])
    .map((assignment) => {
      const title = readRelatedTitle(assignment?.title);

      if (!title || title.is_active === false) {
        return null;
      }

      return {
        id: title.id,
        key: title.key,
        label: title.label,
        description: title.description ?? null,
        variant: title.variant || "standard",
        emblemPath: title.emblem_path ?? null,
        sortOrder: Number(title.sort_order ?? 0),
        isPrimary: assignment?.is_primary === true,
        grantedAt: assignment?.granted_at ?? null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }

      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return String(left.key).localeCompare(String(right.key));
    });
}

export function getPrimaryProfileTitle(profile) {
  return normalizeProfileTitles(profile?.profile_titles).find((title) => title.isPrimary) ?? null;
}

export function isMissingProfileTitlesSchemaError(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();

  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST200" ||
    message.includes("profile_titles") ||
    message.includes("could not find a relationship")
  );
}
