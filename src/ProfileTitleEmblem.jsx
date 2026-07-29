import { CELESTIAL_GUIDE_ALT, CELESTIAL_GUIDE_VARIANT } from "./ProfileTitleBadge";

export default function ProfileTitleEmblem({ decorative = false, size = "compact", title }) {
  if (title?.variant !== CELESTIAL_GUIDE_VARIANT || !title.emblemPath) {
    return null;
  }

  const isProfileSize = size === "profile";
  const placementStyle = isProfileSize
    ? {
        width: "clamp(3.75rem, 14vw, 4.5rem)",
        height: "clamp(3.75rem, 14vw, 4.5rem)",
        marginLeft: "auto",
        marginTop: "-0.35rem",
        filter: "drop-shadow(0 0 14px rgb(125 223 255 / 0.16)) drop-shadow(0 2px 10px rgb(0 0 0 / 0.2))",
      }
    : { order: -1 };

  return (
    <img
      alt={decorative ? "" : CELESTIAL_GUIDE_ALT}
      aria-hidden={decorative ? "true" : undefined}
      className={`profile-title-emblem ${
        isProfileSize ? "profile-title-emblem-profile" : "profile-title-emblem-compact"
      }`}
      height="1024"
      src={title.emblemPath}
      style={placementStyle}
      width="1024"
    />
  );
}
