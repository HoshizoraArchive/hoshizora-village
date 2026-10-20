// Shared visual avatar frame.
export function AvatarFrame({ avatar, avatarUrl, className = "h-12 w-12 rounded-2xl text-base", frame = null }) {
  const baseClass =
    "grid flex-none place-items-center overflow-hidden border border-white/20 bg-gradient-to-br from-night-800 via-aurora/70 to-sakura/70 font-black text-white shadow-glow";
  const avatarContent = avatarUrl ? (
    <img alt="" className="h-full w-full object-cover" src={avatarUrl} />
  ) : (
    avatar
  );

  if (!frame) {
    if (avatarUrl) {
      return (
        <div className={`${baseClass} ${className}`}>
          {avatarContent}
        </div>
      );
    }

    return <div className={`${baseClass} ${className}`}>{avatarContent}</div>;
  }

  const frameStyle = {
    "--profile-frame-offset-x": `${frame.offsetX ?? 0}%`,
    "--profile-frame-offset-y": `${frame.offsetY ?? 0}%`,
    "--profile-frame-scale": frame.scale ?? 1.22,
  };

  return (
    <div className={`relative flex-none ${className}`} style={frameStyle}>
      <div className={`${baseClass} h-full w-full rounded-[inherit]`}>
        {avatarContent}
      </div>
      <img
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 max-w-none select-none"
        draggable={false}
        src={frame.assetPath}
        style={{
          height: "calc(100% * var(--profile-frame-scale, 1.22))",
          transform:
            "translate(calc(-50% + var(--profile-frame-offset-x, 0%)), calc(-50% + var(--profile-frame-offset-y, 0%)))",
          width: "calc(100% * var(--profile-frame-scale, 1.22))",
        }}
      />
    </div>
  );
}
