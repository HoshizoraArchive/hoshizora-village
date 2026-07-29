import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./authSessionDisplay.js";
import "./buildVersionWatcher.js";
import "./chiaNotificationExperience.js";
import "./onboardingFirstPostExample.js";
import "./onboardingStarLetterButtonCompatibility.js";
import "./onboardingObserveBootstrap.js";
import "./onboardingObserveArchiveGate.js";
import "./onboardingObserveExperience.js";
import "./onboardingObserveRecovery.js";
import "./onboardingVisibilityRecovery.js";
import "./observeLogoData.js";
import "./index.css";
import "./titlePlateSquareFix.css";
import "./observePolish.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
