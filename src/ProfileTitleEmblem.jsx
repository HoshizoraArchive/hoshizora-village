import { CELESTIAL_GUIDE_ALT, CELESTIAL_GUIDE_VARIANT } from "./ProfileTitleBadge";

export default function ProfileTitleEmblem({ decorative = false, placement = "inline", size = "compact", title }) {
  if (title?.variant !== CELESTIAL_GUIDE_VARIANT || !title.emblemPath) {
    return null;
  }

  const isProfileSize = size === "profile";

  const emblem = (
    <img
      alt={decorative ? "" : CELESTIAL_GUIDE_ALT}
      aria-hidden={decorative ? "true" : undefined}
      className={`profile-title-emblem ${
        isProfileSize ? "profile-title-emblem-profile" : "profile-title-emblem-compact"
      }`}
      height="1024"
      src={title.emblemPath}
      width="1024"
    />
  );

  if (placement === "header") {
    return <span className="profile-title-emblem-header-slot">{emblem}</span>;
  }

  return emblem;
}
