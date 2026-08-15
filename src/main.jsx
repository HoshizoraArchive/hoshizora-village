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
import MobileMediaGlassPreview from "./MobileMediaGlassPreview.jsx";
import "./authSessionDisplay.js";
import "./appOpenTracking.js";
import "./betaUsageAdminEntry.js";
import "./signupOpenTracking.js";
import "./buildVersionWatcher.js";
import "./chiaNotificationExperience.js";
import "./chiaPostNotifications.js";
import "./reconnectNotificationPlatformCopy.js";
import "./myStarChartPreviewExperience.js";
import "./starLetterProfileNavigation.js";
import "./profileMentionNavigation.js";
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
import "./mobileMediaGlass.css";
import "./archivePolish.css";
import "./rConnectPolish.css";
import "./myStarChartPreview.css";
import "./starLetterProfileNavigation.css";
import "./profileMentionNavigation.css";

const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isBetaUsageAdminRoute = normalizedPath === "/admin/beta-usage";
const isSignupOpenAdminRoute = normalizedPath === "/admin/signup-opens";
const searchParams = new URLSearchParams(window.location.search);
const isNetlifyDeployPreviewHost =
  window.location.hostname.startsWith("deploy-preview-") ||
  /^[0-9a-f]{24}--hoshizora-village\.netlify\.app$/.test(window.location.hostname);
const isMobileMediaGlassPreviewRoute =
  isNetlifyDeployPreviewHost && searchParams.get("mediaGlassPreview") === "1";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isMobileMediaGlassPreviewRoute ? (
      <MobileMediaGlassPreview />
    ) : isBetaUsageAdminRoute ? (
      <BetaUsageAdminApp />
    ) : isSignupOpenAdminRoute ? (
      <SignupOpenAdminApp />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
