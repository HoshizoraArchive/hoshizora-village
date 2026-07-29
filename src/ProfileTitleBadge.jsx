const CELESTIAL_GUIDE_VARIANT = "celestial_guide";
const CELESTIAL_GUIDE_ALT = "星空ちあ 街の案内人の紋章";

function GuideStars() {
  return (
    <svg
      aria-hidden="true"
      className="profile-title-guide-stars"
      fill="none"
      viewBox="0 0 72 24"
    >
      <path d="m12 2 1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z" fill="currentColor" />
      <path d="m59 7 1.2 3.3 3.3 1.2-3.3 1.2L59 16l-1.2-3.3-3.3-1.2 3.3-1.2L59 7Z" fill="currentColor" />
      <circle cx="35" cy="5" fill="currentColor" r="1.4" />
      <circle cx="43" cy="19" fill="currentColor" r="1" />
    </svg>
  );
}

export default function ProfileTitleBadge({ size = "compact", title }) {
  if (!title) {
    return null;
  }

  const isProfileSize = size === "profile";
  const isCelestialGuide = title.variant === CELESTIAL_GUIDE_VARIANT;

  if (!isCelestialGuide) {
    return (
      <span
        className={`profile-title-badge profile-title-badge-standard ${
          isProfileSize ? "profile-title-badge-profile" : "profile-title-badge-compact"
        }`}
      >
        {title.label}
      </span>
    );
  }

  return (
    <span
      className={`profile-title-badge profile-title-badge-celestial-guide ${
        isProfileSize ? "profile-title-badge-profile" : "profile-title-badge-compact"
      }`}
    >
      <span className="profile-title-guide-label">{title.label}</span>
      <GuideStars />
    </span>
  );
}

export { CELESTIAL_GUIDE_ALT, CELESTIAL_GUIDE_VARIANT };
