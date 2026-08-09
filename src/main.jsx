import React from "react";
import { createRoot } from "react-dom/client";
import "./pwaInstallPromptBridge.js";
import "./onboardingProfileNameAutoAdvance.js";
import "./onboardingProfileGuideSync.js";
import "./onboardingProfileFollowthrough.js";
import "./onboardingSkipExperience.js";
import App from "./App.jsx";
import BetaUsageAdminApp from "./BetaUsageAdminApp.jsx";
import SignupOpenAdminApp from "./SignupOpenAdminApp.jsx";
import "./authSessionDisplay.js";
import "./appOpenTracking.js";
import "./signupOpenTracking.js";
import "./buildVersionWatcher.js";
import "./chiaNotificationExperience.js";
import "./reconnectNotificationPlatformCopy.js";
import "./myStarChartPreviewExperience.js";
import "./starLetterProfileNavigation.js";
import "./onboardingFirstPostExample.js";
import "./onboardingStarLetterButtonCompatibility.js";
import "./onboardingObserveBootstrap.js";
import "./onboardingObserveArchiveGate.js";
import "./onboardingObserveExperience.js";
import "./onboardingObserveRecovery.js";
import "./onboardingVisibilityRecovery.js";
import "./index.css";
import "./titlePlateSquareFix.css";
import "./observePolish.css";
import "./villageBackgroundArt.css";
import "./onboardingProfileFollowthrough.css";
import "./myUniversePolish.css";
import "./unifiedFeedPolish.css";
import "./postCardCelestialGlass.css";
import "./archivePolish.css";
import "./rConnectPolish.css";
import "./myStarChartPreview.css";
import "./starLetterProfileNavigation.css";

const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isBetaUsageAdminRoute = normalizedPath === "/admin/beta-usage";
const isSignupOpenAdminRoute = normalizedPath === "/admin/signup-opens";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isBetaUsageAdminRoute ? (
      <BetaUsageAdminApp />
    ) : isSignupOpenAdminRoute ? (
      <SignupOpenAdminApp />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
