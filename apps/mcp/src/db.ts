import { isFound, isGiven, validateTable, watchFileSchema, type Cell } from "@skeleton/tables/format";
import postgres from "postgres";
import { loadTables, type PublishedTable } from "./library.js";

export type Sql = postgres.Sql;
export type TransactionSql = postgres.TransactionSql;

/** The team behind the public library. Nobody can take its name. */
export const OFFICIAL_ACCOUNT = "skeletable";

// How often a running server looks for changes another server made. Only changed tables are reread.
const REFRESH_MS = 10_000;

/**
 * Each entry runs once, in order, and is never edited after it ships: a change is a new entry.
 * A public account is separate from the people who sign in to it, so one person can run several.
 * A cell is never overwritten. Every change adds a version, and the newest is the cell's value.
 */
const migrations = [
  `
  create table accounts (
    id bigint generated always as identity primary key,
    handle text not null unique,
    name text not null,
    created_at timestamptz not null default now()
  );
  create table users (
    id bigint generated always as identity primary key,
    email text not null unique,
    name text,
    created_at timestamptz not null default now()
  );
  create table account_members (
    account_id bigint not null references accounts,
    user_id bigint not null references users,
    role text not null default 'owner' check (role in ('owner', 'editor')),
    primary key (account_id, user_id)
  );
  create table data_tables (
    id bigint generated always as identity primary key,
    account_id bigint not null references accounts,
    slug text not null,
    topic text not null,
    title text not null,
    question text not null,
    scope text not null,
    watch jsonb,
    created_at timestamptz not null default now(),
    unique (account_id, slug)
  );
  create table table_columns (
    table_id bigint not null references data_tables on delete cascade,
    id text not null,
    position int not null,
    label text not null,
    type text not null,
    unit text,
    rule text not null,
    primary key (table_id, id)
  );
  create table table_rows (
    id bigint generated always as identity primary key,
    table_id bigint not null references data_tables on delete cascade,
    key text not null,
    position int not null,
    unique (table_id, key)
  );
  create table cell_versions (
    id bigint generated always as identity primary key,
    row_id bigint not null references table_rows on delete cascade,
    column_id text not null,
    cell jsonb not null,
    created_by bigint references users,
    created_at timestamptz not null default now()
  );
  create index cell_versions_newest on cell_versions (row_id, column_id, id desc);
  `,
  `
  create table sessions (
    id bigint generated always as identity primary key,
    token_hash text not null unique,
    user_id bigint not null references users on delete cascade,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
  );
  `,
  `
  create table proposals (
    id bigint generated always as identity primary key,
    table_id bigint not null references data_tables on delete cascade,
    row_id bigint not null references table_rows on delete cascade,
    column_id text not null,
    cell jsonb not null,
    note text,
    check_status text not null,
    status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
    via text not null default 'site' check (via in ('site', 'agent')),
    created_by bigint not null references users,
    decided_by bigint references users,
    decided_at timestamptz,
    created_at timestamptz not null default now()
  );
  create index proposals_by_table on proposals (table_id, id desc);
  create table api_tokens (
    id bigint generated always as identity primary key,
    token_hash text not null unique,
    user_id bigint not null references users on delete cascade,
    name text not null,
    last_used_at timestamptz,
    created_at timestamptz not null default now()
  );
  `,
  `
  alter table users add column blocked_at timestamptz;
  alter table users add column account_id bigint references accounts;
  create table daily_counts (
    day date not null,
    name text not null,
    count bigint not null default 0,
    primary key (day, name)
  );
  `,
  `
  alter table users add column email_updates boolean not null default true;
  `,
  `
  alter table accounts add column team boolean not null default false;
  update accounts set team = true where handle = 'skeletable';
  create table team_invites (
    id bigint generated always as identity primary key,
    account_id bigint not null references accounts on delete cascade,
    email text not null,
    role text not null default 'editor' check (role in ('owner', 'editor')),
    created_at timestamptz not null default now(),
    unique (account_id, email)
  );
  create index team_invites_by_email on team_invites (email);
  `,
  `
  alter table data_tables add column private boolean not null default false;
  create table table_access (
    id bigint generated always as identity primary key,
    table_id bigint not null references data_tables on delete cascade,
    email text not null,
    created_at timestamptz not null default now(),
    unique (table_id, email)
  );
  create index table_access_by_email on table_access (email);
  `,
  `
  alter table accounts add column bio text not null default '';
  alter table data_tables add column managed boolean not null default false;
  alter table table_columns add column removed_at timestamptz;
  alter table table_rows add column removed_at timestamptz;
  update data_tables t set managed = true from accounts a where a.id = t.account_id and a.handle = 'skeletable';
  `,
  `
  alter table table_rows add column former_slugs text[] not null default '{}';
  `,
  `
  alter table data_tables add column draft boolean not null default false;
  `,
  `
  alter table proposals add column bundle_id text;
  alter table proposals add column title text;
  alter table proposals add column base_version bigint;
  alter table proposals add column base_cell jsonb;
  update proposals p set base_version = v.id, base_cell = v.cell
  from cell_versions v where v.id = (select max(v2.id) from cell_versions v2 where v2.row_id = p.row_id and v2.column_id = p.column_id and v2.created_at <= p.created_at);
  create index proposals_by_bundle on proposals(bundle_id);
  `,
  `
  alter table data_tables add column proof text not null default 'required' check (proof in ('required', 'optional'));
  `,
  `
  alter table data_tables add column data_key text unique;
  alter table data_tables add column forked_from text;
  alter table table_columns add column instruction text;
  alter table table_columns add column choices jsonb;
  create table table_versions (
    id bigint generated always as identity primary key,
    table_id bigint not null references data_tables on delete cascade,
    number int not null,
    note text not null default '',
    data jsonb not null,
    created_by bigint references users,
    created_at timestamptz not null default now(),
    unique (table_id, number)
  );
  `,
  `
  create sequence table_revisions;
  alter table data_tables add column revision bigint not null default nextval('table_revisions');

  -- Any change to a table, its account, rows, columns, cells or versions gives it a new revision,
  -- so a server reloads only the tables whose revision moved.
  create function bump_own_revision() returns trigger language plpgsql as $$
  begin new.revision := nextval('table_revisions'); return new; end $$;
  create trigger data_tables_revision before update on data_tables
    for each row when (old.revision = new.revision) execute function bump_own_revision();

  create function bump_tables(ids bigint[]) returns void language sql as $$
    update data_tables set revision = nextval('table_revisions') where id = any(ids) $$;

  create function bump_from_cells() returns trigger language plpgsql as $$
  begin perform bump_tables(array(select distinct r.table_id from changed c join table_rows r on r.id = c.row_id)); return null; end $$;
  create trigger cell_versions_revision after insert on cell_versions referencing new table as changed for each statement execute function bump_from_cells();

  create function bump_from_children() returns trigger language plpgsql as $$
  begin perform bump_tables(array(select distinct table_id from changed)); return null; end $$;
  create trigger table_rows_added after insert on table_rows referencing new table as changed for each statement execute function bump_from_children();
  create trigger table_rows_changed after update on table_rows referencing new table as changed for each statement execute function bump_from_children();
  create trigger table_columns_added after insert on table_columns referencing new table as changed for each statement execute function bump_from_children();
  create trigger table_columns_changed after update on table_columns referencing new table as changed for each statement execute function bump_from_children();
  create trigger table_versions_added after insert on table_versions referencing new table as changed for each statement execute function bump_from_children();

  create function bump_from_accounts() returns trigger language plpgsql as $$
  begin perform bump_tables(array(select t.id from data_tables t join changed c on c.id = t.account_id)); return null; end $$;
  create trigger accounts_changed after update on accounts referencing new table as changed for each statement execute function bump_from_accounts();
  `,

];

/** Run whatever hasn't run yet. The lock keeps two servers starting together from racing. */
export async function migrate(sql: Sql) {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(7001)`;
    await tx`create table if not exists schema_migrations (version int primary key, ran_at timestamptz not null default now())`;
    const ran = new Set((await tx`select version from schema_migrations`).map((row) => row.version as number));
    for (const [index, migration] of migrations.entries()) {
      if (ran.has(index + 1)) continue;
      await tx.unsafe(migration);
      await tx`insert into schema_migrations (version) values (${index + 1})`;
    }
  });
}

const accountName = (handle: string) => handle.charAt(0).toUpperCase() + handle.slice(1);

/**
 * Add any table the database doesn't have. One it has gains the file's new rows, its scope and a
 * newer watch. Its cells only move on for a value in a blank or a value read more recently, each as
 * a new version, so an edit made on the site isn't undone by a deploy. Tables from the library's
 * files are `managed`: their shape is changed in the file, so the site won't change it for them.
 */
export async function importTables(sql: Sql, tables: PublishedTable[], { managed = false } = {}) {
  await sql.begin(async (tx) => {
    const addRow = async (tableId: string, row: PublishedTable["rows"][number], position: number) => {
      const [saved] = await tx`insert into table_rows (table_id, key, position) values (${tableId}, ${row.key}, ${position}) returning id`;
      for (const [columnId, cell] of Object.entries(row.cells)) {
        await tx`insert into cell_versions (row_id, column_id, cell) values (${saved!.id}, ${columnId}, ${tx.json(cell)})`;
      }
    };
    for (const table of tables) {
      const [account] = await tx`
        insert into accounts (handle, name, team) values (${table.owner}, ${accountName(table.owner)}, ${table.owner === OFFICIAL_ACCOUNT})
        on conflict (handle) do update set handle = excluded.handle returning id`;
      const watch = table.watch ? tx.json(table.watch) : null;
      const [existing] = await tx`select id, watch from data_tables where account_id = ${account!.id} and slug = ${table.slug}`;
      if (existing) {
        if (table.watch && table.watch.ran >= (existing.watch?.ran ?? "")) await tx`update data_tables set watch = ${watch} where id = ${existing.id}`;
        await tx`update data_tables set scope = ${table.scope}, managed = managed or ${managed} where id = ${existing.id}`;
        const saved = await tx`select id, key from table_rows where table_id = ${existing.id}`;
        const current = await tx`
          select distinct on (v.row_id, v.column_id) v.row_id, v.column_id, v.cell
          from cell_versions v join table_rows r on r.id = v.row_id
          where r.table_id = ${existing.id}
          order by v.row_id, v.column_id, v.id desc`;
        const onDisk = new Set(table.rows.map((row) => row.key));
        for (const [position, row] of table.rows.entries()) {
          const match = saved.find((candidate) => candidate.key === row.key);
          if (!match) {
            await addRow(existing.id, row, position);
            continue;
          }
          await tx`update table_rows set position = ${position} where id = ${match.id}`;
          for (const [columnId, cell] of Object.entries(row.cells)) {
            const held = current.find((candidate) => candidate.row_id === match.id && candidate.column_id === columnId)?.cell as Cell | undefined;
            // A source read and found to have no value fills a blank the same way.
            const settles = "missing" in cell && cell.absent && (!held || ("missing" in held && !held.absent));
            // A value with no quote only fills a blank, and a quoted one replaces it.
            const fills = isGiven(cell) && (!held || "missing" in held);
            if (settles || fills || (isFound(cell) && (!held || !isFound(held) || cell.read > held.read))) {
              await tx`insert into cell_versions (row_id, column_id, cell) values (${match.id}, ${columnId}, ${tx.json(cell)})`;
            }
          }
        }
        // Rows added on the site follow the file's, in the order they already had.
        const added = saved.filter((row) => !onDisk.has(row.key));
        for (const [offset, row] of added.entries()) await tx`update table_rows set position = ${table.rows.length + offset} where id = ${row.id}`;
        continue;
      }
      const [created] = await tx`
        insert into data_tables (account_id, slug, topic, title, question, scope, watch, private, managed, draft, proof, forked_from)
        values (${account!.id}, ${table.slug}, ${table.topic}, ${table.title}, ${table.question}, ${table.scope}, ${watch}, ${table.private ?? false}, ${managed}, ${table.draft ?? false}, ${table.proof ?? "required"}, ${table.forkedFrom ?? null})
        returning id`;
      for (const [position, column] of table.columns.entries()) {
        await tx`
          insert into table_columns (table_id, id, position, label, type, unit, rule, instruction, choices)
          values (${created!.id}, ${column.id}, ${position}, ${column.label}, ${column.type}, ${column.unit ?? null}, ${column.rule}, ${column.instruction ?? null}, ${column.choices ? tx.json(column.choices) : null})`;
      }
      for (const [position, row] of table.rows.entries()) await addRow(created!.id, row, position);
    }
  });
}

/** A table as read from the database, with what identifies it there, or why it didn't pass its checks. */
type Loaded = { id: string; revision: string; key: string; table?: PublishedTable; problem?: string };

/**
 * Tables with the newest version of each cell, held to the same checks as a table on disk. With
 * `ids`, only those tables are read, which is what keeps a refresh cheap as the library grows.
 */
async function loadFromDatabase(sql: Sql, ids?: string[]): Promise<Loaded[]> {
  const only = ids ? sql`where t.id = any(${ids}::bigint[])` : sql``;
  const tables = await sql`
    select t.id, t.revision, a.handle as owner, a.name as owner_name, a.team, t.slug, t.topic, t.title, t.question, t.scope, t.watch, t.private, t.managed, t.draft, t.proof, t.forked_from
    from data_tables t join accounts a on a.id = t.account_id ${only}
    order by a.handle, t.slug`;
  if (!tables.length) return [];
  const tableIds = tables.map((table) => table.id as string);
  // Removed rows and columns stay for the history, out of the table.
  const columns = await sql`select * from table_columns where removed_at is null and table_id = any(${tableIds}::bigint[]) order by table_id, position`;
  const rows = await sql`select * from table_rows where removed_at is null and table_id = any(${tableIds}::bigint[]) order by table_id, position`;
  const rowIds = rows.map((row) => row.id as string);
  const cells = await sql`select distinct on (row_id, column_id) row_id, column_id, cell from cell_versions where row_id = any(${rowIds}::bigint[]) order by row_id, column_id, id desc`;
  const versions = await sql`select table_id, number, note, created_at, jsonb_array_length(data->'rows') as rows from table_versions where table_id = any(${tableIds}::bigint[]) order by table_id, number`;
  // Grouped once, so a big table doesn't make every row look through every cell.
  const group = <T extends Record<string, unknown>>(items: readonly T[], key: string) => {
    const groups = new Map<unknown, T[]>();
    for (const item of items) {
      const list = groups.get(item[key]);
      if (list) list.push(item);
      else groups.set(item[key], [item]);
    }
    return (id: unknown) => groups.get(id) ?? [];
  };
  const columnsOf = group(columns, "table_id");
  const rowsOf = group(rows, "table_id");
  const cellsOf = group(cells, "row_id");
  const versionsOf = group(versions, "table_id");

  return tables.map((table): Loaded => {
    const loaded = { id: String(table.id), revision: String(table.revision), key: `${table.owner}/${table.slug}` };
    const live = new Set(columnsOf(table.id).map((column) => column.id as string));
    const { problems, table: checked } = validateTable({
      format: 1,
      owner: table.owner,
      slug: table.slug,
      ...(table.draft && { draft: true }),
      ...(table.proof === "optional" && { proof: "optional" }),
      topic: table.topic,
      title: table.title,
      question: table.question,
      scope: table.scope,
      columns: columnsOf(table.id)
        .map(({ id, label, type, unit, rule, instruction, choices }) => ({ id, label, type, rule, ...(unit && { unit }), ...(instruction && { instruction }), ...(choices && { choices }) })),
      rows: rowsOf(table.id)
        .map((row) => ({
          key: row.key,
          cells: Object.fromEntries(cellsOf(row.id).filter((cell) => live.has(cell.column_id)).map((cell): [string, Cell] => [cell.column_id, cell.cell])),
        })),
    });
    // A broken table can have a problem in every cell, so the log names the first few and counts the rest.
    if (!checked || problems.length) return { ...loaded, problem: `${loaded.key}: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? `; and ${problems.length - 5} more` : ""}` };
    // A person's account name can be the name they signed in with, so only a team's goes out with its tables.
    const moved = Object.fromEntries(rowsOf(table.id).flatMap((row) => (row.former_slugs as string[]).map((slug) => [slug, row.key as string])));
    const saved = versionsOf(table.id).map((version) => ({ number: version.number as number, note: version.note as string, created: (version.created_at as Date).toISOString().slice(0, 10), rows: version.rows as number }));
    return { ...loaded, table: { ...checked, ...(saved.length && { versions: saved }), ...(table.forked_from && { forkedFrom: table.forked_from as string }), ...(Object.keys(moved).length && { moved }), ...(table.team && { ownerName: table.owner_name as string }), ...(table.private && { private: true }), ...(table.managed && { managed: true }), ...(table.watch && { watch: watchFileSchema.parse(table.watch) }) } };
  });
}

/** Every table. One that fails its checks stops the read, so nothing goes out unchecked. */
export async function readTables(sql: Sql): Promise<PublishedTable[]> {
  const loaded = await loadFromDatabase(sql);
  const failed = loaded.find((entry) => entry.problem);
  if (failed) throw new Error(failed.problem);
  return loaded.map((entry) => entry.table!);
}

const byAddress = (a: PublishedTable, b: PublishedTable) => (a.owner === b.owner ? (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0) : a.owner < b.owner ? -1 : 1);

/**
 * Keeps `tables` in step with the database by reloading only the tables whose revision changed
 * since the last look, and dropping deleted ones. A table that fails its checks keeps its last good
 * version and is tried again next time. Calls run one at a time, so two never interleave.
 */
export function librarySync(sql: Sql, tables: PublishedTable[], log: (message: string) => void = console.error) {
  const known = new Map<string, { revision: string; key: string }>();
  const sync = async () => {
    const now = await sql`select id, revision from data_tables`;
    const current = new Map(now.map((row) => [String(row.id), String(row.revision)]));
    const changed = [...current].filter(([id, revision]) => known.get(id)?.revision !== revision).map(([id]) => id);
    const gone = [...known.keys()].filter((id) => !current.has(id));
    if (!changed.length && !gone.length) return;
    const loaded = changed.length ? await loadFromDatabase(sql, changed) : [];
    const drop = new Set(gone.map((id) => known.get(id)!.key));
    for (const id of gone) known.delete(id);
    const fresh: PublishedTable[] = [];
    for (const entry of loaded) {
      if (entry.problem) {
        log(`Keeping the last good ${entry.key}: ${entry.problem}`);
        continue;
      }
      const before = known.get(entry.id);
      if (before) drop.add(before.key);
      drop.add(entry.key);
      known.set(entry.id, { revision: entry.revision, key: entry.key });
      fresh.push(entry.table!);
    }
    const kept = tables.filter((table) => !drop.has(`${table.owner}/${table.slug}`));
    tables.splice(0, tables.length, ...[...kept, ...fresh].sort(byAddress));
  };
  let running: Promise<void> = Promise.resolve();
  return () => (running = running.catch(() => {}).then(sync));
}

export const connect = (url: string): Sql => postgres(url, { max: 5, onnotice: () => {} });

/**
 * The library from the database, seeded with any new tables on disk. A server keeps the same list
 * and refills it, so a change goes live without a deploy. A refresh that fails keeps the last good tables.
 */
export async function openLibrary(sql: Sql, dir: string) {
  await migrate(sql);
  await importTables(sql, await loadTables(dir), { managed: true });
  const tables: PublishedTable[] = [];
  const sync = librarySync(sql, tables);
  await sync();
  // After a write, and every few seconds for changes another server made. Each look costs one small query.
  const refresh = sync;
  setInterval(() => refresh().catch((error) => console.error(`Couldn't refresh the tables: ${error}`)), REFRESH_MS).unref();
  return { tables, refresh };
}
