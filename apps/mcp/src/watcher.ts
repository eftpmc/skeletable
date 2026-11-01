import { liveFetcher, watchTable, type Fetcher } from "@skeleton/tables";
import type { Sql } from "./db.js";
import type { PublishedTable } from "./library.js";

const FIRST_RUN_MS = 60_000;
const LOOK_EVERY_MS = 60 * 60_000;

/** Watch every table that hasn't been watched today. A failure on one table doesn't stop the rest. */
export async function watchDueTables(sql: Sql, tables: PublishedTable[], fetcher: Fetcher, pauseMs = 1000) {
  const today = new Date().toISOString().slice(0, 10);
  let watched = 0;
  for (const table of [...tables]) {
    if (table.watch?.ran === today) continue;
    try {
      const watch = await watchTable(table, fetcher, today, table.watch, pauseMs);
      await sql`
        update data_tables t set watch = ${sql.json(watch)}
        from accounts a where a.id = t.account_id and a.handle = ${table.owner} and t.slug = ${table.slug}`;
      watched += 1;
    } catch (error) {
      console.error(`Couldn't watch ${table.owner}/${table.slug}: ${error}`);
    }
  }
  return watched;
}

/** Check once a day that live quotes are still on their pages. This uses no AI. It looks hourly, so a restart can't skip a day. */
export function startWatching(sql: Sql, tables: PublishedTable[], refresh: () => Promise<unknown>) {
  const fetcher = liveFetcher();
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      if (await watchDueTables(sql, tables, fetcher)) await refresh();
    } catch (error) {
      console.error(`Quote watch failed: ${error}`);
    } finally {
      running = false;
    }
  };
  setTimeout(run, FIRST_RUN_MS).unref();
  setInterval(run, LOOK_EVERY_MS).unref();
}
