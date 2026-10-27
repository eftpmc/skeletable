import { type Db, schema } from "@closet/db";
import type { NotifySettings, NotifySettingsInput } from "@closet/shared";
import { and, asc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { safeFetch } from "../net/safe-fetch.js";
import type { Mailer } from "./mailer.js";

const { alertEvent, brand, notifySettings, product, savedSearch, user } = schema;

export class NotifyError extends Error {}

type Options = {
  publicUrl: string;
  serverName: string;
  mailer: Mailer | null;
  digestHour: number;
  allowPrivate: boolean;
};

type SettingsRow = typeof notifySettings.$inferSelect;

/** One alert as words: what a push or a digest line says, and where it opens. */
export type AlertMessage = { id: string; title: string; body: string; url: string; imageUrl: string | null };

/** Most pushes one person gets per run; anything past it is summed up in one more. */
const MAX_PUSHES = 5;

/** Sends alerts outside the app: each one to ntfy as it happens, and a morning email digest. */
export class NotifyService {
  constructor(
    private readonly db: Db,
    private readonly options: Options,
  ) {}

  async settings(userId: string): Promise<NotifySettings> {
    const [row] = await this.db
      .select({ settings: notifySettings, email: user.email })
      .from(user)
      .leftJoin(notifySettings, eq(notifySettings.userId, user.id))
      .where(eq(user.id, userId));
    return {
      ntfyUrl: row?.settings?.ntfyUrl ?? null,
      emailDigest: row?.settings?.emailDigest ?? false,
      timezone: row?.settings?.timezone ?? "UTC",
      email: row?.email ?? "",
      emailAvailable: this.options.mailer !== null,
      digestHour: this.options.digestHour,
    };
  }

  async saveSettings(userId: string, input: NotifySettingsInput): Promise<NotifySettings> {
    if (input.emailDigest && !this.options.mailer) throw new NotifyError("This server can't send email yet.");
    const [before] = await this.db.select().from(notifySettings).where(eq(notifySettings.userId, userId));
    const now = new Date();
    // Turning a channel on (or pointing ntfy somewhere new) starts it from now, not the backlog.
    const ntfySince = input.ntfyUrl && input.ntfyUrl !== before?.ntfyUrl ? now : (before?.ntfySince ?? null);
    const emailSince = input.emailDigest && !before?.emailDigest ? now : (before?.emailSince ?? null);
    const values = { ntfyUrl: input.ntfyUrl, emailDigest: input.emailDigest, timezone: input.timezone, ntfySince, emailSince };
    await this.db
      .insert(notifySettings)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: notifySettings.userId, set: values });
    return this.settings(userId);
  }

  /** Send a sample now, so people can check it reaches them. */
  async sendTest(userId: string, channel: "ntfy" | "email") {
    const settings = await this.settings(userId);
    const sample: AlertMessage = {
      id: "test",
      title: `Alerts from ${this.options.serverName} will look like this`,
      body: "New matches for your saved searches and price drops on what you track.",
      url: `${this.options.publicUrl}/alerts`,
      imageUrl: null,
    };
    if (channel === "ntfy") {
      if (!settings.ntfyUrl) throw new NotifyError("Add an ntfy topic first.");
      await this.push(settings.ntfyUrl, sample);
    } else {
      if (!this.options.mailer) throw new NotifyError("This server can't send email yet.");
      await this.options.mailer.send(this.digestEmail(settings.email, [sample]));
    }
  }

  /** Push what's new to ntfy, and send digests that are due. One person's failure doesn't stop the rest. */
  async deliver(now = new Date()) {
    const rows = await this.db
      .select({ settings: notifySettings, email: user.email })
      .from(notifySettings)
      .innerJoin(user, eq(notifySettings.userId, user.id))
      .where(or(sql`${notifySettings.ntfyUrl} is not null`, eq(notifySettings.emailDigest, true)));
    for (const { settings, email } of rows) {
      if (settings.ntfyUrl) {
        await this.pushPending(settings).catch((error) => console.error(`ntfy for ${settings.userId} failed:`, error));
      }
      if (settings.emailDigest && this.options.mailer && digestDue(settings, now, this.options.digestHour)) {
        await this.sendDigest(settings, email, now).catch((error) => console.error(`digest for ${settings.userId} failed:`, error));
      }
    }
  }

  private async pushPending(settings: SettingsRow) {
    const pending = await this.db
      .select({ id: alertEvent.id })
      .from(alertEvent)
      .where(
        and(
          eq(alertEvent.userId, settings.userId),
          isNull(alertEvent.pushedAt),
          isNull(alertEvent.readAt),
          gte(alertEvent.createdAt, settings.ntfySince ?? new Date(0)),
        ),
      )
      .orderBy(asc(alertEvent.createdAt));
    if (pending.length === 0) return;
    const messages = await this.messages(pending.map((p) => p.id));
    for (const message of messages.slice(0, MAX_PUSHES)) await this.push(settings.ntfyUrl!, message);
    if (messages.length > MAX_PUSHES) {
      await this.push(settings.ntfyUrl!, {
        id: "more",
        title: `${messages.length - MAX_PUSHES} more alerts`,
        body: "Open your alerts to see them all.",
        url: `${this.options.publicUrl}/alerts`,
        imageUrl: null,
      });
    }
    await this.db.update(alertEvent).set({ pushedAt: new Date() }).where(inArray(alertEvent.id, pending.map((p) => p.id)));
  }

  private async sendDigest(settings: SettingsRow, to: string, now: Date) {
    const pending = await this.db
      .select({ id: alertEvent.id })
      .from(alertEvent)
      .where(
        and(
          eq(alertEvent.userId, settings.userId),
          isNull(alertEvent.emailedAt),
          isNull(alertEvent.readAt),
          gte(alertEvent.createdAt, settings.emailSince ?? new Date(0)),
        ),
      )
      .orderBy(asc(alertEvent.createdAt));
    // Nothing new means no email, but the morning still counts as done.
    if (pending.length > 0) {
      await this.options.mailer!.send(this.digestEmail(to, await this.messages(pending.map((p) => p.id))));
      await this.db.update(alertEvent).set({ emailedAt: now }).where(inArray(alertEvent.id, pending.map((p) => p.id)));
    }
    await this.db.update(notifySettings).set({ lastDigestAt: now }).where(eq(notifySettings.userId, settings.userId));
  }

  /** ntfy's JSON publish: POST to the server root with the topic in the body, so titles can be any text. */
  private async push(topicUrl: string, message: AlertMessage) {
    const url = new URL(topicUrl);
    const topic = url.pathname.split("/").filter(Boolean).pop();
    if (!topic) throw new NotifyError("That ntfy link has no topic.");
    url.pathname = url.pathname.replace(/\/[^/]*\/?$/, "/");
    const body = { topic, title: message.title, message: message.body, click: message.url, ...(message.imageUrl ? { attach: message.imageUrl } : {}) };
    await safeFetch(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      accept: "application/json",
      timeoutMs: 10_000,
      allowPrivate: this.options.allowPrivate,
    });
  }

  async messages(eventIds: string[]): Promise<AlertMessage[]> {
    if (eventIds.length === 0) return [];
    const rows = await this.db
      .select({ event: alertEvent, search: savedSearch, title: product.title, imageUrl: product.imageUrl, brandName: brand.name })
      .from(alertEvent)
      .leftJoin(savedSearch, eq(alertEvent.savedSearchId, savedSearch.id))
      .leftJoin(product, eq(alertEvent.productId, product.id))
      .leftJoin(brand, eq(product.brandId, brand.id))
      .where(inArray(alertEvent.id, eventIds))
      .orderBy(asc(alertEvent.createdAt));
    const base = this.options.publicUrl;
    return rows.flatMap(({ event: e, search: s, title, imageUrl, brandName }): AlertMessage[] => {
      if (e.kind === "new_matches" && s) {
        const params = new URLSearchParams({ q: s.query });
        if (s.intent) params.set("intent", JSON.stringify(s.intent));
        if (s.condition) params.set("condition", s.condition);
        if (s.maxPrice) params.set("max", String(s.maxPrice));
        const count = e.count ?? 0;
        return [{ id: e.id, title: `${count} new for “${s.query}”`, body: count === 1 ? "A new match for your saved search." : `${count} new matches for your saved search.`, url: `${base}/search?${params}`, imageUrl: null }];
      }
      if (e.kind === "price_drop" && e.productId && title !== null) {
        const name = brandName && !title.toLowerCase().startsWith(brandName.toLowerCase()) ? `${brandName} ${title}` : title;
        const money = (cents: number) => formatMoney(cents, e.currency ?? "USD");
        return [{
          id: e.id,
          title: `Price drop: ${name}`,
          body: `Now ${money(e.toPriceCents ?? 0)}, down from ${money(e.fromPriceCents ?? 0)}.`,
          url: `${base}/p/${e.productId}`,
          imageUrl,
        }];
      }
      return [];
    });
  }

  private digestEmail(to: string, messages: AlertMessage[]) {
    const name = this.options.serverName;
    const subject = messages.length === 1 ? messages[0]!.title : `${messages.length} new alerts from ${name}`;
    const text = [
      ...messages.map((m) => `${m.title}\n${m.body}\n${m.url}`),
      `Change what you get: ${this.options.publicUrl}/profile`,
    ].join("\n\n");
    const items = messages
      .map(
        (m) =>
          `<tr><td style="padding:12px 0;border-bottom:1px solid #eee"><a href="${escapeHtml(m.url)}" style="color:#111;font-weight:600;text-decoration:none">${escapeHtml(m.title)}</a><div style="color:#555;margin-top:4px">${escapeHtml(m.body)}</div></td></tr>`,
      )
      .join("");
    const html = `<div style="font-family:-apple-system,system-ui,sans-serif;font-size:15px;max-width:560px;margin:0 auto;color:#111"><h1 style="font-size:20px">Your alerts</h1><table style="width:100%;border-collapse:collapse">${items}</table><p style="color:#777;font-size:13px;margin-top:24px">Sent by ${escapeHtml(name)}. <a href="${escapeHtml(`${this.options.publicUrl}/profile`)}" style="color:#777">Change what you get</a>.</p></div>`;
    return { to, subject, text, html };
  }
}

/** Past the digest hour in their zone, and none sent yet today there. */
export function digestDue(settings: Pick<SettingsRow, "timezone" | "lastDigestAt">, now: Date, hour: number) {
  const today = localParts(now, settings.timezone);
  if (today.hour < hour) return false;
  return !settings.lastDigestAt || localParts(settings.lastDigestAt, settings.timezone).date !== today.date;
}

function localParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2);
  }
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
