import { useEffect, useState } from "react";
import hoshizoraVillageLogo from "./assets/branding/hoshizora-village-logo.png";

export default function ObserveBrandHeader() {
  const [isLogoAvailable, setIsLogoAvailable] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    let frameId = 0;

    const syncScrollState = () => {
      frameId = 0;
      setIsScrolled(window.scrollY > 2);
    };

    const scheduleScrollState = () => {
      if (!frameId) {
        frameId = window.requestAnimationFrame(syncScrollState);
      }
    };

    syncScrollState();
    window.addEventListener("scroll", scheduleScrollState, { passive: true });

    return () => {
      window.removeEventListener("scroll", scheduleScrollState);
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  return (
    <header className={`observe-brand-header${isScrolled ? " is-scrolled" : ""}`}>
      <div className="observe-brand-header-logo-slot">
        {isLogoAvailable ? (
          <img
            alt="星空Village"
            className="observe-brand-header-logo"
            draggable={false}
            onError={() => setIsLogoAvailable(false)}
            src={hoshizoraVillageLogo}
          />
        ) : (
          <span className="observe-brand-header-fallback">星空Village</span>
        )}
      </div>
    </header>
  );
}
