import { bindings, defineConfig, defineWorker, triggers } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "flyovahelp",
    // vinext app + cron handler (see worker/index.js for what each schedule runs).
    entrypoint: "./worker/index.js",
    compatibilityDate: "2026-10-21",
    compatibilityFlags: ["nodejs_compat"],
    // Run next to Firestore/RTDB: the engine makes many sequential Google API calls,
    // and from the nearest edge (e.g. Johannesburg) each one is a long round trip.
    placement: { mode: "smart" },
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    triggers: [
      // Apex + www only. A "*.strawins.com/*" route misses the bare domain and
      // would also capture other subdomains (e.g. chat.strawins.com).
      triggers.fetch({ pattern: "strawins.com/*", zone: "strawins.com" }),
      triggers.fetch({ pattern: "www.strawins.com/*", zone: "strawins.com" }),
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
