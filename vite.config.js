import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { applyProfileActionLayout } from "./scripts/profile-action-layout-transform.mjs";

function getClientBuildId() {
  return (
    process.env.COMMIT_REF ||
    process.env.NETLIFY_COMMIT_REF ||
    process.env.DEPLOY_ID ||
    process.env.BUILD_ID ||
    `local-${Date.now()}`
  );
}

function clientBuildVersionPlugin(buildId) {
  return {
    name: "hoshizora-client-build-version",
    transformIndexHtml(html) {
      const metaTag = `<meta name="hoshizora-build-id" content="${buildId}" />`;

      return html.includes("hoshizora-build-id")
        ? html
        : html.replace("</head>", `    ${metaTag}\n  </head>`);
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify(
          {
            buildId,
            generatedAt: new Date().toISOString(),
          },
          null,
          2,
        )}\n`,
      });
    },
  };
}

function profileActionLayoutPlugin() {
  return {
    name: "hoshizora-profile-action-layout",
    enforce: "pre",
    transform(code, id) {
      const cleanId = id.split("?", 1)[0];
      if (!cleanId.endsWith("/src/App.jsx")) {
        return null;
      }

      return {
        code: applyProfileActionLayout(code),
        map: null,
      };
    },
  };
}

const clientBuildId = getClientBuildId();

export default defineConfig({
  plugins: [profileActionLayoutPlugin(), react(), clientBuildVersionPlugin(clientBuildId)],
});
