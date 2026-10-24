// Shared mobile navigation rendering.
export const bottomNavItems = [
  { id: "observe", label: "観測", icon: "telescope" },
  { id: "rconnect", label: "Re:Connect", icon: "bell" },
  { id: "post", label: "流星便", icon: "plus", primary: true },
  { id: "archive", label: "Archive", icon: "bookmark" },
  { id: "profile", label: "My Universe", ariaLabel: "My Universe", icon: "asterism" },
];

export function BottomNav({ activeTab, onTabChange, onboardingTarget = "", unreadCount = 0 }) {
  return (
    <nav
      aria-label="星空Village bottom navigation"
      className="bottom-navigation fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-5"
    >
      <div className="mx-auto max-w-2xl rounded-3xl border border-white/15 bg-night-950/85 px-2 py-2 shadow-[0_0_40px_rgba(125,223,255,0.16)] backdrop-blur-2xl">
        <div className="grid grid-cols-5 items-end gap-1">
          {bottomNavItems.map((item) => {
            const isActive = activeTab === item.id;
            const showUnread = item.id === "rconnect" && unreadCount > 0;
            const buttonClass = item.primary
              ? `-mt-5 flex min-h-16 flex-col items-center justify-center gap-1 rounded-3xl bg-gradient-to-br from-comet via-aurora to-sakura px-2 pb-2 pt-2 text-night-950 shadow-glow transition hover:scale-[1.03] ${
                  isActive ? "-translate-y-1 ring-2 ring-white/40" : ""
                }`
              : `flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 transition ${
                  isActive ? "bg-comet/15 text-white ring-1 ring-comet/30" : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`;

            return (
              <button
                aria-current={isActive ? "page" : undefined}
                aria-label={item.ariaLabel ?? item.label}
                aria-describedby={showUnread ? "rconnect-unread-description" : undefined}
                className={buttonClass}
                data-onboarding-target={onboardingTarget === `nav-${item.id}` ? onboardingTarget : undefined}
                key={item.id}
                onClick={() => onTabChange(item.id)}
                type="button"
              >
                <span
                  className={
                    item.primary
                      ? "grid h-9 w-9 place-items-center rounded-full bg-night-950/15 text-night-950"
                      : `relative grid h-6 w-6 place-items-center ${isActive ? "text-white" : "text-comet"}`
                  }
                >
                  <BottomNavIcon icon={item.icon} />
                  {showUnread && (
                    <>
                      <span
                        aria-hidden="true"
                        className="absolute -right-3 -top-2 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-night-950 bg-sakura px-1 text-[10px] font-black leading-none text-night-950 shadow-glow"
                        data-testid="rconnect-unread-badge"
                      >
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                      <span className="sr-only" id="rconnect-unread-description">
                        未読{unreadCount}件
                      </span>
                    </>
                  )}
                </span>
                <span
                  className={`text-center text-[10px] font-black leading-tight ${item.primary ? "text-night-950" : ""}`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export function BottomNavIcon({ icon }) {
  if (icon === "plus") {
    return <span className="text-2xl leading-none">+</span>;
  }

  if (icon === "telescope") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M4 14.5 14.5 9l1.5 3L5.5 17.5 4 14.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="m14.5 9 3-1.6 2.2 4.2-3.7 1.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M9.5 16 7 21" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="m11.5 14.8 3.2 5.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "bell") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M18 10a6 6 0 0 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "bookmark") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M7 4h10v16l-5-3-5 3V4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "asterism") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="m12 2.6 1.05 3.15 3.15 1.05-3.15 1.05L12 11l-1.05-3.15L7.8 6.8l3.15-1.05L12 2.6Z" />
        <path d="m5.7 12.9.82 2.45 2.45.82-2.45.82-.82 2.45-.82-2.45-2.45-.82 2.45-.82.82-2.45Z" />
        <path d="m18.3 12.9.82 2.45 2.45.82-2.45.82-.82 2.45-.82-2.45-2.45-.82 2.45-.82.82-2.45Z" />
      </svg>
    );
  }

  return <span aria-hidden="true" className="text-xl leading-none">✩</span>;
}
