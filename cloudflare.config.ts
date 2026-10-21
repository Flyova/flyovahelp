import { bindings, defineConfig, defineWorker, triggers } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "flyovahelp",
    // vinext app + cron handler (see worker/index.js for what each schedule runs).
    entrypoint: "./worker/index.js",
    compatibilityDate: "2026-10-21",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    triggers: [
      triggers.scheduled({ schedule: "* * * * *" }),
      triggers.scheduled({ schedule: "0 3 * * *" }),
    ],
    env: {
      ASSETS: bindings.assets(),
      // Server secrets. Set in production with `wrangler secret put <NAME>`;
      // locally they are read from .dev.vars (git-ignored).
      FIREBASE_PROJECT_ID: bindings.secret(),
      FIREBASE_CLIENT_EMAIL: bindings.secret(),
      FIREBASE_PRIVATE_KEY: bindings.secret(),
      RESEND_API_KEY: bindings.secret(),
      CRON_SECRET: bindings.secret(),
    },
  }),
});
