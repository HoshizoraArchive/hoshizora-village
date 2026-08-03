import { readFileSync, writeFileSync } from "node:fs";

const path = "src/App.jsx";
let source = readFileSync(path, "utf8");

function replaceOnce(label, from, to) {
  const first = source.indexOf(from);
  if (first === -1) {
    throw new Error(`missing replacement target: ${label}`);
  }
  if (source.indexOf(from, first + from.length) !== -1) {
    throw new Error(`replacement target is not unique: ${label}`);
  }
  source = `${source.slice(0, first)}${to}${source.slice(first + from.length)}`;
}

replaceOnce(
  "freshness import",
  `} from "./observeTimelineRefresh";\nimport {\n  BLACK_HOLE_ERROR_MESSAGE,`,
  `} from "./observeTimelineRefresh";\nimport { APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS, shouldRefreshAfterForeground } from "./appDataFreshness";\nimport {\n  BLACK_HOLE_ERROR_MESSAGE,`,
);

replaceOnce(
  "server data revision state",
  `  const [timelineHasNewPosts, setTimelineHasNewPosts] = useState(false);\n  const publicPostsRefreshInFlightRef = useRef(false);`,
  `  const [timelineHasNewPosts, setTimelineHasNewPosts] = useState(false);\n  const [serverDataRevision, setServerDataRevision] = useState(0);\n  const publicPostsRefreshInFlightRef = useRef(false);`,
);

replaceOnce(
  "foreground refs",
  `  const isObserveTimelineActiveRef = useRef(false);\n  const appMountedRef = useRef(true);`,
  `  const isObserveTimelineActiveRef = useRef(false);\n  const foregroundHiddenAtRef = useRef(null);\n  const foregroundRefreshTimerRef = useRef(null);\n  const appMountedRef = useRef(true);`,
);

const dependencyReplacements = [
  ["saved resonance revision", `    readResonances();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [postIdsKey]);`, `    readResonances();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [postIdsKey, serverDataRevision]);`],
  ["own resonance revision", `    readOwnPostResonances();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [ownPostIdsKey]);`, `    readOwnPostResonances();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [ownPostIdsKey, serverDataRevision]);`],
  ["resonated resonance revision", `    readResonatedPostResonances();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [resonatedPostIdsKey]);`, `    readResonatedPostResonances();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [resonatedPostIdsKey, serverDataRevision]);`],
  ["archived resonance revision", `    readArchivedPostResonances();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [archivedPostIdsKey]);`, `    readArchivedPostResonances();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [archivedPostIdsKey, serverDataRevision]);`],
  ["public profile resonance revision", `    readPublicProfilePostResonances();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [publicProfilePostIdsKey]);`, `    readPublicProfilePostResonances();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [publicProfilePostIdsKey, serverDataRevision]);`],
  ["meteor tag resonance revision", `    readMeteorTagPostResonances();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [meteorTagPostIdsKey]);`, `    readMeteorTagPostResonances();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [meteorTagPostIdsKey, serverDataRevision]);`],
  ["detail resonance revision", `    readDetailPostResonances();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [detailPost?.id]);`, `    readDetailPostResonances();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [detailPost?.id, serverDataRevision]);`],
  ["media revision", `    readPostMedia();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [allPostIdsKey]);`, `    readPostMedia();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [allPostIdsKey, serverDataRevision]);`],
  ["meteor tags revision", `    readMeteorTags();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [allPostIdsKey]);`, `    readMeteorTags();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [allPostIdsKey, serverDataRevision]);`],
  ["star letters revision", `    readStarLetters();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [allPostIdsKey, profileFrames]);`, `    readStarLetters();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [allPostIdsKey, profileFrames, serverDataRevision]);`],
  ["archives revision", `    readArchivedPosts();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [session?.user?.id, profileFrames]);`, `    readArchivedPosts();\n\n    return () => {\n      isMounted = false;\n    };\n  }, [session?.user?.id, profileFrames, serverDataRevision]);`],
];

for (const [label, from, to] of dependencyReplacements) {
  replaceOnce(label, from, to);
}

replaceOnce(
  "direct observe full-card resync",
  `      setTimelineHasNewPosts(false);\n\n      if (scrollToTop) {`,
  `      setServerDataRevision((current) => current + 1);\n      setTimelineHasNewPosts(false);\n\n      if (scrollToTop) {`,
);

replaceOnce(
  "foreground server resync",
  `  const checkForNewPublicPosts = useCallback(async () => {`,
  `  useEffect(() => {\n    const markHidden = () => {\n      foregroundHiddenAtRef.current = Date.now();\n      window.clearTimeout(foregroundRefreshTimerRef.current);\n      foregroundRefreshTimerRef.current = null;\n    };\n\n    const scheduleForegroundRefresh = () => {\n      if (document.visibilityState !== "visible" || foregroundHiddenAtRef.current === null) {\n        return;\n      }\n\n      const hiddenAt = foregroundHiddenAtRef.current;\n      foregroundHiddenAtRef.current = null;\n      window.clearTimeout(foregroundRefreshTimerRef.current);\n      foregroundRefreshTimerRef.current = window.setTimeout(() => {\n        foregroundRefreshTimerRef.current = null;\n\n        if (\n          shouldRefreshAfterForeground({\n            hiddenAt,\n            now: Date.now(),\n            visibilityState: document.visibilityState,\n          })\n        ) {\n          void refreshObserveTimeline();\n        }\n      }, 180);\n    };\n\n    const handleVisibilityChange = () => {\n      if (document.visibilityState === "hidden") {\n        markHidden();\n      } else {\n        scheduleForegroundRefresh();\n      }\n    };\n\n    document.addEventListener("visibilitychange", handleVisibilityChange);\n    window.addEventListener("pagehide", markHidden);\n    window.addEventListener("pageshow", scheduleForegroundRefresh);\n    window.addEventListener("focus", scheduleForegroundRefresh);\n\n    return () => {\n      document.removeEventListener("visibilitychange", handleVisibilityChange);\n      window.removeEventListener("pagehide", markHidden);\n      window.removeEventListener("pageshow", scheduleForegroundRefresh);\n      window.removeEventListener("focus", scheduleForegroundRefresh);\n      window.clearTimeout(foregroundRefreshTimerRef.current);\n      foregroundRefreshTimerRef.current = null;\n    };\n  }, [refreshObserveTimeline]);\n\n  const checkForNewPublicPosts = useCallback(async () => {`,
);

if (source.includes("AppDataFreshnessBoundary")) {
  throw new Error("App.jsx unexpectedly depends on AppDataFreshnessBoundary");
}

writeFileSync(path, source);
console.log("Applied server-data-only freshness refactor to src/App.jsx");
