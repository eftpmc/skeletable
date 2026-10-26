import nodemailer from "nodemailer";
import type { Config } from "../config.js";

export type Email = { to: string; subject: string; text: string; html: string };
export type Mailer = { send(email: Email): Promise<void> };

/** SMTP when SMTP_URL is set, else Resend when RESEND_API_KEY is. Null when email isn't set up. */
export function mailerFromConfig(config: Config): Mailer | null {
  const from = config.EMAIL_FROM;
  if (!from) return null;
  if (config.SMTP_URL) {
    const transport = nodemailer.createTransport(config.SMTP_URL);
    return {
      async send(email) {
        await transport.sendMail({ from, ...email });
      },
    };
  }
  if (config.RESEND_API_KEY) {
    const key = config.RESEND_API_KEY;
    return {
      async send(email) {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`Resend refused the email: ${response.status} ${await response.text()}`);
      },
    };
  }
  return null;
}
