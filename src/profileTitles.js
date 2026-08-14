export const PROFILE_TITLES_RELATION_SELECT =
  "profile_titles(is_primary, granted_at, title:titles(id, key, label, description, variant, emblem_path, is_active, sort_order)), profile_cohorts(cohort_key, serial_number, joined_at)";

export const FOUNDING_RESIDENT_TITLE_KEY = "beta_tester";
export const BETA_RESIDENT_COHORT_KEY = "beta_resident";
export const BETA_RESIDENT_ALUMNI_COHORT_KEY = "beta_resident_alumni";

function readRelatedTitle(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readFoundingResidentSerialNumber(cohorts) {
  const rows = Array.isArray(cohorts) ? cohorts : cohorts ? [cohorts] : [];
  const foundingCohort = rows.find((cohort) =>
    [BETA_RESIDENT_COHORT_KEY, BETA_RESIDENT_ALUMNI_COHORT_KEY].includes(cohort?.cohort_key),
  );
  const serialNumber = Number(foundingCohort?.serial_number);

  return Number.isInteger(serialNumber) && serialNumber > 0 ? serialNumber : null;
}

export function getFoundingResidentTitleLabel(serialNumber) {
  return Number.isInteger(serialNumber) && serialNumber > 0
    ? `古参村人 No.${serialNumber}`
    : "古参村人";
}

export function normalizeProfileTitles(assignments, cohorts = []) {
  const foundingResidentSerialNumber = readFoundingResidentSerialNumber(cohorts);

  return (assignments ?? [])
    .map((assignment) => {
      const title = readRelatedTitle(assignment?.title);

      if (!title || title.is_active === false) {
        return null;
      }

      return {
        id: title.id,
        key: title.key,
        label:
          title.key === FOUNDING_RESIDENT_TITLE_KEY && foundingResidentSerialNumber !== null
            ? getFoundingResidentTitleLabel(foundingResidentSerialNumber)
            : title.label,
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
  return (
    normalizeProfileTitles(profile?.profile_titles, profile?.profile_cohorts).find(
      (title) => title.isPrimary,
    ) ?? null
  );
}

export function isMissingProfileTitlesSchemaError(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();

  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST200" ||
    message.includes("profile_titles") ||
    message.includes("profile_cohorts") ||
    message.includes("could not find a relationship")
  );
}
