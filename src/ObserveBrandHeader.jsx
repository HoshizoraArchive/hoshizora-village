import { useEffect, useRef, useState } from "react";
import hoshizoraVillageLogo from "./assets/branding/hoshizora-village-logo.png";

const INTRO_MINIMUM_MS = 700;
const INTRO_MAXIMUM_MS = 1700;
const INTRO_FLIGHT_MS = 640;

export default function ObserveBrandHeader({
  error = "",
  introEnabled = false,
  loading = false,
  onIntroFinished,
}) {
  const [isLogoAvailable, setIsLogoAvailable] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [introPhase, setIntroPhase] = useState(introEnabled ? "loading" : "complete");
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [maximumElapsed, setMaximumElapsed] = useState(false);
  const [sawLoading, setSawLoading] = useState(false);
  const [flightTarget, setFlightTarget] = useState(null);
  const headerLogoRef = useRef(null);
  const onIntroFinishedRef = useRef(onIntroFinished);
  onIntroFinishedRef.current = onIntroFinished;

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

  useEffect(() => {
    if (!introEnabled || introPhase !== "loading") return undefined;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIntroPhase("complete");
      onIntroFinishedRef.current?.();
      return undefined;
    }

    const minimumTimer = window.setTimeout(() => setMinimumElapsed(true), INTRO_MINIMUM_MS);
    const maximumTimer = window.setTimeout(() => setMaximumElapsed(true), INTRO_MAXIMUM_MS);
    return () => {
      window.clearTimeout(minimumTimer);
      window.clearTimeout(maximumTimer);
    };
  }, [introEnabled, introPhase]);

  useEffect(() => {
    if (loading) setSawLoading(true);
  }, [loading]);

  useEffect(() => {
    if (
      introPhase === "loading" &&
      minimumElapsed &&
      ((sawLoading && !loading) || Boolean(error) || maximumElapsed)
    ) {
      setIntroPhase("flying");
    }
  }, [error, introPhase, loading, maximumElapsed, minimumElapsed, sawLoading]);

  useEffect(() => {
    if (introPhase !== "flying") return undefined;

    const headerLogo = headerLogoRef.current;
    if (!headerLogo) {
      setIntroPhase("complete");
      onIntroFinishedRef.current?.();
      return undefined;
    }

    const rect = headerLogo.getBoundingClientRect();
    const frameId = window.requestAnimationFrame(() => {
      setFlightTarget({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        height: rect.height,
      });
    });
    const timer = window.setTimeout(() => {
      setIntroPhase("complete");
      onIntroFinishedRef.current?.();
    }, INTRO_FLIGHT_MS + 70);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timer);
    };
  }, [introPhase]);

  const isIntroActive = introEnabled && introPhase !== "complete";

  return (
    <>
      <header
        className={`observe-brand-header${isScrolled ? " is-scrolled" : ""}${isIntroActive ? " is-intro-active" : ""}`}
      >
        <div className="observe-brand-header-logo-slot">
          {isLogoAvailable ? (
            <img
              alt="星空Village"
              className="observe-brand-header-logo"
              draggable={false}
              onError={() => setIsLogoAvailable(false)}
              ref={headerLogoRef}
              src={hoshizoraVillageLogo}
            />
          ) : (
            <span className="observe-brand-header-fallback" ref={headerLogoRef}>星空Village</span>
          )}
        </div>
      </header>

      {isIntroActive && (
        <div className={`observe-brand-intro${introPhase === "flying" ? " is-flying" : ""}`}
          data-observe-intro
          data-phase={introPhase}
        >
          <div
            className="observe-brand-intro-flight"
            style={flightTarget ? {
              left: `${flightTarget.x}px`,
              top: `${flightTarget.y}px`,
              height: `${flightTarget.height}px`,
            } : undefined}
          >
            {isLogoAvailable ? (
              <>
                <img alt="" aria-hidden="true" className="observe-brand-intro-image" draggable={false}
                  src={hoshizoraVillageLogo} />
                <div className="observe-brand-intro-shine" aria-hidden="true">
                  <img alt="" draggable={false} src={hoshizoraVillageLogo} />
                </div>
              </>
            ) : (
              <span className="observe-brand-intro-fallback">星空Village</span>
            )}
          </div>
          <p className="observe-brand-intro-status" role="status">公開流星便を読み込み中...</p>
        </div>
      )}
    </>
  );
}
