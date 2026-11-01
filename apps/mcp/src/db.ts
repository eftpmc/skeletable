import { isFound, validateTable, watchFileSchema, type Cell } from "@skeleton/tables/format";
import postgres from "postgres";
import { loadTables, type PublishedTable } from "./library.js";

export type Sql = postgres.Sql;

/** The team behind the public library. Nobody can take its name. */
export const OFFICIAL_ACCOUNT = "skeletable";

// How often a running server picks up changes made in the database.
const REFRESH_MS = 60_000;

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
            if (isFound(cell) && (!held || !isFound(held) || cell.read > held.read)) {
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
        insert into data_tables (account_id, slug, topic, title, question, scope, watch, private, managed)
        values (${account!.id}, ${table.slug}, ${table.topic}, ${table.title}, ${table.question}, ${table.scope}, ${watch}, ${table.private ?? false}, ${managed})
        returning id`;
      for (const [position, column] of table.columns.entries()) {
        await tx`
          insert into table_columns (table_id, id, position, label, type, unit, rule)
          values (${created!.id}, ${column.id}, ${position}, ${column.label}, ${column.type}, ${column.unit ?? null}, ${column.rule})`;
      }
      for (const [position, row] of table.rows.entries()) await addRow(created!.id, row, position);
    }
  });
}

/** Every table with the newest version of each cell, held to the same checks as a table on disk. */
export async function readTables(sql: Sql): Promise<PublishedTable[]> {
  const tables = await sql`
    select t.id, a.handle as owner, a.name as owner_name, a.team, t.slug, t.topic, t.title, t.question, t.scope, t.watch, t.private, t.managed
    from data_tables t join accounts a on a.id = t.account_id
    order by a.handle, t.slug`;
  // Removed rows and columns stay for the history, out of the table.
  const columns = await sql`select * from table_columns where removed_at is null order by table_id, position`;
  const rows = await sql`select * from table_rows where removed_at is null order by table_id, position`;
  const cells = await sql`select distinct on (row_id, column_id) row_id, column_id, cell from cell_versions order by row_id, column_id, id desc`;

  return tables.map((table) => {
    const live = new Set(columns.filter((column) => column.table_id === table.id).map((column) => column.id as string));
    const { problems, table: checked } = validateTable({
      format: 1,
      owner: table.owner,
      slug: table.slug,
      topic: table.topic,
      title: table.title,
      question: table.question,
      scope: table.scope,
      columns: columns
        .filter((column) => column.table_id === table.id)
        .map(({ id, label, type, unit, rule }) => ({ id, label, type, rule, ...(unit && { unit }) })),
      rows: rows
        .filter((row) => row.table_id === table.id)
        .map((row) => ({
          key: row.key,
          cells: Object.fromEntries(cells.filter((cell) => cell.row_id === row.id && live.has(cell.column_id)).map((cell): [string, Cell] => [cell.column_id, cell.cell])),
        })),
    });
    if (!checked || problems.length) throw new Error(`${table.owner}/${table.slug}: ${problems.join("; ")}`);
    // A person's account name can be the name they signed in with, so only a team's goes out with its tables.
    return { ...checked, ...(table.team && { ownerName: table.owner_name as string }), ...(table.private && { private: true }), ...(table.managed && { managed: true }), ...(table.watch && { watch: watchFileSchema.parse(table.watch) }) };
  });
}

export const connect = (url: string): Sql => postgres(url, { max: 5, onnotice: () => {} });

/**
 * The library from the database, seeded with any new tables on disk. A server keeps the same list
 * and refills it, so a change goes live without a deploy. A refresh that fails keeps the last good tables.
 */
export async function openLibrary(sql: Sql, dir: string) {
  await migrate(sql);
  await importTables(sql, await loadTables(dir), { managed: true });
  const tables = await readTables(sql);
  const refresh = () => readTables(sql).then((fresh) => tables.splice(0, tables.length, ...fresh));
  setInterval(() => refresh().catch((error) => console.error(`Keeping the last good tables: ${error}`)), REFRESH_MS).unref();
  return { tables, refresh };
}
