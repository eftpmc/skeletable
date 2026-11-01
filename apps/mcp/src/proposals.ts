import { createHash, randomBytes } from "node:crypto";
import { liveFetcher, verifyTable, type Fetcher } from "@skeleton/tables";
import { validateTable, type Column, type FoundCell, type Table } from "@skeleton/tables/format";
import type { Sql } from "./db.js";

export type ProposalInput = { owner: string; slug: string; row: string; column: string; value: string; source: string; quote: string; note?: string };

type Result = { id: string; check: string } | { error: string };

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

const today = () => new Date().toISOString().slice(0, 10);

/** Read typed text as the kind of value the column holds. */
function asValue(column: Column, raw: string): FoundCell["value"] | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  if (column.type === "text") return text;
  if (column.type === "number") {
    const number = Number(text.replace(/,/g, ""));
    return Number.isFinite(number) ? number : undefined;
  }
  if (/^(yes|true)$/i.test(text)) return true;
  return /^(no|false)$/i.test(text) ? false : undefined;
}

/**
 * Put a change forward. It has to pass a table's own checks, and its quote can't be missing from
 * the page, so a proposal reaches a person with its proof already tested. A page we can't read
 * still goes through, marked as unchecked, because the reviewer can open it.
 */
export async function submitProposal(sql: Sql, tables: Table[], input: ProposalInput, userId: string, via: "site" | "agent", fetcher: Fetcher = liveFetcher()): Promise<Result> {
  const table = tables.find((t) => t.owner === input.owner && t.slug === input.slug);
  const row = table?.rows.find((r) => r.key === input.row);
  const column = table?.columns.find((c) => c.id === input.column);
  if (!table || !row || !column) return { error: "There's no such cell." };
  const value = asValue(column, input.value);
  if (value === undefined) return { error: `Enter a ${column.type === "text" ? "value" : column.type} for ${column.label}.` };
  const current = row.cells[column.id]!;
  if ("value" in current && current.value === value) return { error: "That's already the value." };

  const archived = /(^|\/\/)web\.archive\.org\//.test(input.source);
  const cell: FoundCell = { value, source: input.source.trim(), kind: archived ? "archived" : "first-hand", quote: input.quote.trim(), read: today() };
  const { problems } = validateTable({ ...table, rows: [{ key: row.key, cells: { ...row.cells, [column.id]: cell } }] });
  if (problems.length) return { error: problems[0]!.replace(`${row.key}.${column.id}: `, "") };

  const [check] = await verifyTable({ ...table, columns: [column], rows: [{ key: row.key, cells: { [column.id]: cell } }] }, fetcher, 0);
  if (check!.status === "not-on-page") return { error: "That quote isn't on that page." };

  const [created] = await sql`
    insert into proposals (table_id, row_id, column_id, cell, note, check_status, created_by, via)
    select r.table_id, r.id, ${column.id}, ${sql.json(cell)}, ${input.note?.trim() || null}, ${check!.status}, ${userId}, ${via}
    from table_rows r join data_tables t on t.id = r.table_id join accounts a on a.id = t.account_id
    where a.handle = ${table.owner} and t.slug = ${table.slug} and r.key = ${row.key}
    returning id`;
  return { id: created!.id as string, check: check!.status };
}

/** A table's proposals, newest first, each with the value it would replace. */
export const listProposals = (sql: Sql, owner: string, slug: string) => sql`
  select p.id, r.key as row, p.column_id as column, p.cell, p.note, p.check_status as check, p.status, p.via, p.created_at,
    coalesce(u.name, 'Someone') as author,
    (select v.cell from cell_versions v where v.row_id = p.row_id and v.column_id = p.column_id order by v.id desc limit 1) as current
  from proposals p
  join table_rows r on r.id = p.row_id
  join data_tables t on t.id = p.table_id
  join accounts a on a.id = t.account_id
  join users u on u.id = p.created_by
  where a.handle = ${owner} and t.slug = ${slug}
  order by p.id desc limit 100`;

/** Accept or reject an open proposal, if this person runs the table's account. Accepting adds a version, so the old value stays. */
export async function decideProposal(sql: Sql, id: string, userId: string, accept: boolean) {
  return sql.begin(async (tx) => {
    const [proposal] = await tx`
      select p.id, p.row_id, p.column_id, p.cell, p.created_by from proposals p
      join data_tables t on t.id = p.table_id
      join account_members m on m.account_id = t.account_id
      where p.id = ${id} and p.status = 'open' and m.user_id = ${userId}
      for update of p`;
    if (!proposal) return false;
    await tx`update proposals set status = ${accept ? "accepted" : "rejected"}, decided_by = ${userId}, decided_at = now() where id = ${id}`;
    if (accept) {
      await tx`insert into cell_versions (row_id, column_id, cell, created_by) values (${proposal.row_id}, ${proposal.column_id}, ${tx.json(proposal.cell)}, ${proposal.created_by})`;
    }
    return true;
  });
}

/** Every change to a table's values, newest first, with what each value was before. The first version of a cell isn't a change. */
export const tableHistory = (sql: Sql, owner: string, slug: string) => sql`
  select * from (
    select v.id, r.key as row, v.column_id as column, v.cell, v.created_at, coalesce(u.name, 'Skeletable') as author,
      lag(v.cell) over (partition by v.row_id, v.column_id order by v.id) as previous
    from cell_versions v
    join table_rows r on r.id = v.row_id
    join data_tables t on t.id = r.table_id
    join accounts a on a.id = t.account_id
    left join users u on u.id = v.created_by
    where a.handle = ${owner} and t.slug = ${slug}
  ) changes
  where previous is not null order by id desc limit 100`;

/** Make a token an agent can act with. Only its hash is kept, so it's shown once. */
export async function createToken(sql: Sql, userId: string, name: string) {
  const token = `skt_${randomBytes(32).toString("base64url")}`;
  const [created] = await sql`insert into api_tokens (token_hash, user_id, name) values (${hash(token)}, ${userId}, ${name}) returning id`;
  return { id: created!.id as string, name, token };
}

export const listTokens = (sql: Sql, userId: string) =>
  sql`select id, name, created_at, last_used_at from api_tokens where user_id = ${userId} order by id desc`;

export const deleteToken = (sql: Sql, userId: string, id: string) => sql`delete from api_tokens where id = ${id} and user_id = ${userId}`;

/** Whose token this is, from an Authorization header. */
export async function tokenUser(sql: Sql, header: string | undefined) {
  const token = header?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return null;
  const [row] = await sql`update api_tokens set last_used_at = now() where token_hash = ${hash(token)} returning user_id`;
  return row ? (row.user_id as string) : null;
}
