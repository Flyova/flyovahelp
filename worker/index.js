import app from "vinext/server/fetch-handler";

// Worker entry: the vinext app for HTTP, plus Cron Triggers that call the
// existing /api/cron/* routes in-process (same auth header an external
// scheduler would send). Schedules are declared in cloudflare.config.ts.
export const CRON_JOBS = {
  // Keeps StraWins to Dollars rounds rolling even when no game page is open.
  "* * * * *": ["/api/cron/game-engine?r=cron"],
  // Daily support-chat cleanup (was a Vercel cron).
  "0 3 * * *": ["/api/cron/cleanup-chats"],
};

const worker = {
  ...app,
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    const paths = CRON_JOBS[controller.cron] || [];
    const headers = env.CRON_SECRET ? { authorization: `Bearer ${env.CRON_SECRET}` } : {};
    await Promise.all(
      paths.map(async (path) => {
        const res = await app.fetch(new Request(`https://cron.internal${path}`, { headers }), env, ctx);
        if (!res.ok) console.error(`Cron ${controller.cron} ${path} failed: ${res.status} ${await res.text()}`);
      })
    );
  },
};

export default worker;
