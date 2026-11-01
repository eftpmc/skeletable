import type { Sql } from "./db.js";

export type Mailer = (to: string, subject: string, text: string) => Promise<void>;

/** Send through Resend, with a sender from a verified domain. */
export function resendMailer(apiKey: string, from: string, fetcher: typeof fetch = fetch): Mailer {
  return async (to, subject, text) => {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!response.ok) throw new Error(`Resend said ${response.status}`);
  };
}

/** Tell the people who run a table about a new proposal. Mail never holds up or fails the proposal itself. */
export async function notifyOwners(sql: Sql, mail: Mailer | undefined, publicUrl: string, proposalId: string) {
  if (!mail) return;
  try {
    const owners = await sql`
      select u.email, t.title, a.handle, t.slug, r.key as row, p.column_id
      from proposals p
      join data_tables t on t.id = p.table_id
      join accounts a on a.id = t.account_id
      join table_rows r on r.id = p.row_id
      join account_members m on m.account_id = a.id
      join users u on u.id = m.user_id
      where p.id = ${proposalId} and u.id <> p.created_by and u.email_updates and u.blocked_at is null`;
    await Promise.all(
      owners.map((owner) =>
        mail(
          owner.email as string,
          `New proposal on ${owner.title as string}`,
          `Someone suggested a change to ${owner.row as string} in ${owner.title as string}, with its source and quote.\n\nReview it: ${publicUrl}/${owner.handle as string}/${owner.slug as string}/proposals\n\nYou can turn these emails off in Settings: ${publicUrl}/settings`,
        ),
      ),
    );
  } catch (error) {
    console.error(`Couldn't send a proposal email: ${error}`);
  }
}
