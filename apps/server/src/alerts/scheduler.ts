import type { NotifyService } from "./notify.js";
import type { AlertsService } from "./service.js";

/** How often pushes and digests that are due go out, between checks. */
const DELIVERY_MINUTES = 10;

/**
 * Re-runs saved searches and re-prices watched products every `minutes`, starting a minute after
 * boot, then sends what they found. Delivery also runs every few minutes on its own, so morning
 * digests go out near the hour. A run that is still going when the next is due is not doubled up.
 * Returns a stop function.
 */
export function startAlertsScheduler(alerts: AlertsService, notify: NotifyService, minutes: number) {
  let running = false;
  const guarded = (job: () => Promise<void>) => async () => {
    if (running) return;
    running = true;
    try {
      await job();
    } catch (error) {
      console.error("alerts: run failed:", error);
    } finally {
      running = false;
    }
  };
  const check = guarded(async () => {
    const started = Date.now();
    await alerts.runAll();
    console.log(`alerts: checked saved searches and watches in ${Math.round((Date.now() - started) / 1000)}s`);
    await notify.deliver();
  });
  const deliver = guarded(() => notify.deliver());
  const timers = [setTimeout(check, 60_000), setInterval(check, minutes * 60_000), setInterval(deliver, DELIVERY_MINUTES * 60_000)];
  for (const timer of timers) timer.unref();
  return () => {
    for (const timer of timers) clearTimeout(timer);
  };
}
