import { CELESTIAL_GUIDE_ALT, CELESTIAL_GUIDE_VARIANT } from "./ProfileTitleBadge";

export default function ProfileTitleEmblem({ decorative = false, size = "compact", title }) {
  if (title?.variant !== CELESTIAL_GUIDE_VARIANT || !title.emblemPath) {
    return null;
  }

  const isProfileSize = size === "profile";

  return (
    <img
      alt={decorative ? "" : CELESTIAL_GUIDE_ALT}
      aria-hidden={decorative ? "true" : undefined}
      className={`profile-title-emblem ${
        isProfileSize ? "profile-title-emblem-profile" : "profile-title-emblem-compact"
      }`}
      height="1024"
      src={title.emblemPath}
      style={{ order: -1 }}
      width="1024"
    />
  );
}
