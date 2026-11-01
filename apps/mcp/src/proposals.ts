import { createHash, randomBytes, randomUUID } from "node:crypto";
import { liveFetcher, verifyTable, type Fetcher } from "@skeleton/tables";
import { validateTable, type Column, type FoundCell, type Table } from "@skeleton/tables/format";
import type { Sql, TransactionSql } from "./db.js";

export type ProposalInput = { owner: string; slug: string; row: string; column: string; value: string; source: string; quote: string; note?: string; bundleId?: string; title?: string };

type Result = { id: string; check: string } | { error: string };

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

const today = () => new Date().toISOString().slice(0, 10);

/** Read typed text as the kind of value the column holds. */
export function asValue(column: Pick<Column, "type">, raw: string): FoundCell["value"] | undefined {
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
export async function submitProposal(sql: Sql | TransactionSql, tables: Table[], input: ProposalInput, userId: string, via: "site" | "agent", fetcher: Fetcher = liveFetcher()): Promise<Result> {
  const table = tables.find((t) => t.owner === input.owner && t.slug === input.slug);
  const row = table?.rows.find((r) => r.key === input.row);
  const column = table?.columns.find((c) => c.id === input.column);
  if (!table || !row || !column) return { error: "There's no such cell." };
  const value = asValue(column, input.value);
  if (value === undefined) return { error: `Enter a ${column.type === "text" ? "value" : column.type} for ${column.label}.` };
  const current = row.cells[column.id]!;
  if ("value" in current && current.value === value) return { error: "That's already the value." };

  const [base] = await sql`select v.id, v.cell from cell_versions v join table_rows r on r.id = v.row_id
    join data_tables t on t.id = r.table_id join accounts a on a.id = t.account_id
    where a.handle = ${table.owner} and t.slug = ${table.slug} and r.key = ${row.key} and r.removed_at is null and v.column_id = ${column.id}
    order by v.id desc limit 1`;
  if (!base) return { error: "This cell was removed. Refresh and try again." };
  const archived = /(^|\/\/)web\.archive\.org\//.test(input.source);
  const cell: FoundCell = { value, source: input.source.trim(), kind: archived ? "archived" : "first-hand", quote: input.quote.trim(), read: today() };
  const { problems } = validateTable({ ...table, rows: [{ key: row.key, cells: { ...row.cells, [column.id]: cell } }] });
  if (problems.length) return { error: "The quote has to state that exact value, word for word." };

  const [check] = await verifyTable({ ...table, columns: [column], rows: [{ key: row.key, cells: { [column.id]: cell } }] }, fetcher, 0);
  if (check!.status === "not-on-page") return { error: "That quote isn't on that page." };

  const [created] = await sql`
    insert into proposals (table_id, row_id, column_id, cell, note, check_status, created_by, via, bundle_id, title, base_version, base_cell)
    select r.table_id, r.id, ${column.id}, ${sql.json(cell)}, ${input.note?.trim() || null}, ${check!.status}, ${userId}, ${via}, ${input.bundleId ?? null}, ${input.title ?? null},
      ${base.id}, ${sql.json(base.cell)}
    from table_rows r join data_tables t on t.id = r.table_id join accounts a on a.id = t.account_id
    where a.handle = ${table.owner} and t.slug = ${table.slug} and r.key = ${row.key}
    returning id`;
  return created ? { id: created.id as string, check: check!.status } : { error: "This cell was removed. Refresh and try again." };
}

/** A bundle is all-or-nothing: every source must pass before any proposal is saved. */
export async function submitBundle(sql: Sql, tables: Table[], input: { owner: string; slug: string; title: string; note?: string; changes: Omit<ProposalInput, "owner" | "slug">[] }, userId: string, fetcher?: Fetcher): Promise<Result> {
  if (!input.changes.length || input.changes.length > 20 || !input.title.trim()) return { error: "Add a title and between 1 and 20 changes." };
  if (new Set(input.changes.map((c) => JSON.stringify([c.row, c.column]))).size !== input.changes.length) return { error: "Each cell can appear only once in a proposal." };
  const bundleId = randomUUID();
  class InvalidProposal extends Error {}
  try {
    return await sql.begin(async (tx) => {
      let result: Result = { error: "No changes." };
      for (const change of input.changes) {
        result = await submitProposal(tx, tables, { ...change, owner: input.owner, slug: input.slug, note: input.note, title: input.title.trim(), bundleId }, userId, "site", fetcher);
        if ("error" in result) throw new InvalidProposal(result.error);
      }
      return result;
    });
  } catch (error) {
    if (error instanceof InvalidProposal) return { error: error.message };
    throw error;
  }
}

/** A table's proposals, newest first, each with the value it would replace. */
export const listProposals = (sql: Sql, owner: string, slug: string) => sql`
  select p.id, p.bundle_id, p.title, p.base_cell,
    p.base_version is distinct from (select v.id from cell_versions v where v.row_id = p.row_id and v.column_id = p.column_id order by v.id desc limit 1) as stale, r.key as row, p.column_id as column, p.cell, p.note, p.check_status as check, p.status, p.via, p.created_at,
    coalesce(u.name, 'Someone') as author,
    (select v.cell from cell_versions v where v.row_id = p.row_id and v.column_id = p.column_id order by v.id desc limit 1) as current
  from proposals p
  join table_rows r on r.id = p.row_id
  join data_tables t on t.id = p.table_id
  join accounts a on a.id = t.account_id
  join users u on u.id = p.created_by
  where a.handle = ${owner} and t.slug = ${slug}
  order by p.id desc`;

/** Accept or reject an open proposal, if this person runs the table's account. Accepting adds a version, so the old value stays. */
export async function decideProposal(sql: Sql, id: string, userId: string, accept: boolean) {
  return sql.begin(async (tx) => {
    const [target] = await tx`select table_id, bundle_id from proposals where id = ${id}`;
    if (!target) return false;
    // Serialize reviews for a table and verify membership before reading its changes.
    const [allowed] = await tx`select t.id from data_tables t join account_members m on m.account_id = t.account_id
      where t.id = ${target.table_id} and m.user_id = ${userId} for update of t`;
    if (!allowed) return false;
    const proposals = await tx`select p.* from proposals p where p.table_id = ${target.table_id}
      and (p.id = ${id} or (${target.bundle_id}::text is not null and p.bundle_id = ${target.bundle_id})) order by p.id for update`;
    if (!proposals.some((p) => p.status === "open") || (accept && proposals.some((p) => p.status !== "open"))) return false;
    if (accept) {
      for (const proposal of proposals) {
        const [current] = await tx`select id from cell_versions where row_id = ${proposal.row_id} and column_id = ${proposal.column_id} order by id desc limit 1`;
        if (!current || String(current.id) !== String(proposal.base_version)) return false;
      }
    }
    for (const proposal of proposals.filter((p) => p.status === "open")) {
      await tx`update proposals set status = ${accept ? "accepted" : "rejected"}, decided_by = ${userId}, decided_at = now() where id = ${proposal.id}`;
      if (accept) await tx`insert into cell_versions (row_id, column_id, cell, created_by) values (${proposal.row_id}, ${proposal.column_id}, ${tx.json(proposal.cell)}, ${proposal.created_by})`;
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
  const [row] = await sql`
    update api_tokens t set last_used_at = now() from users u
    where t.token_hash = ${hash(token)} and u.id = t.user_id and u.blocked_at is null
    returning t.user_id`;
  return row ? (row.user_id as string) : null;
}
