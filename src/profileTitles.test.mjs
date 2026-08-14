import assert from "node:assert/strict";
import test from "node:test";

import {
  BETA_RESIDENT_ALUMNI_COHORT_KEY,
  BETA_RESIDENT_COHORT_KEY,
  FOUNDING_RESIDENT_TITLE_KEY,
  getFoundingResidentTitleLabel,
  getPrimaryProfileTitle,
  normalizeProfileTitles,
} from "./profileTitles.js";

const foundingAssignment = {
  is_primary: true,
  granted_at: "2026-08-14T00:00:00.000Z",
  title: {
    id: "title-beta",
    key: FOUNDING_RESIDENT_TITLE_KEY,
    label: "古参村人",
    description: "開村初期の記念称号",
    variant: "standard",
    emblem_path: null,
    is_active: true,
    sort_order: 100,
  },
};

// Keep No.1 and No.10 explicit so single- and double-digit labels remain regression-covered.
test("founding resident label uses non-zero-padded serial number", () => {
  assert.equal(getFoundingResidentTitleLabel(1), "古参村人 No.1");
  assert.equal(getFoundingResidentTitleLabel(10), "古参村人 No.10");
  assert.equal(getFoundingResidentTitleLabel(null), "古参村人");
});

test("beta resident serial customizes the shared beta title", () => {
  const [title] = normalizeProfileTitles([foundingAssignment], [
    { cohort_key: BETA_RESIDENT_COHORT_KEY, serial_number: 3 },
  ]);

  assert.equal(title.label, "古参村人 No.3");
});

test("alumni cohort preserves the numbered founding title", () => {
  const title = getPrimaryProfileTitle({
    profile_titles: [foundingAssignment],
    profile_cohorts: [
      { cohort_key: BETA_RESIDENT_ALUMNI_COHORT_KEY, serial_number: 7 },
    ],
  });

  assert.equal(title.label, "古参村人 No.7");
});

test("unrelated primary titles keep their catalog label", () => {
  const title = getPrimaryProfileTitle({
    profile_titles: [
      {
        is_primary: true,
        granted_at: "2026-07-29T00:00:00.000Z",
        title: {
          id: "title-chia",
          key: "celestial_guide",
          label: "街の案内人",
          description: null,
          variant: "celestial_guide",
          emblem_path: "/assets/titles/chia-celestial-guide-emblem.png",
          is_active: true,
          sort_order: 10,
        },
      },
    ],
    profile_cohorts: [],
  });

  assert.equal(title.label, "街の案内人");
});
