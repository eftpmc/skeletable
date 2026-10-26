import type { AlertsService } from "./service.js";

/**
 * Re-runs saved searches and re-prices watched products every `minutes`, starting a minute after
 * boot. A run that is still going when the next is due is not doubled up. Returns a stop function.
 */
export function startAlertsScheduler(alerts: AlertsService, minutes: number) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    const started = Date.now();
    try {
      await alerts.runAll();
      console.log(`alerts: checked saved searches and watches in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (error) {
      console.error("alerts: run failed:", error);
    } finally {
      running = false;
    }
  };
  const first = setTimeout(tick, 60_000);
  const every = setInterval(tick, minutes * 60_000);
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
