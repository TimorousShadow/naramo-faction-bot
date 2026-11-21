// TimorousShadow
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface GlobalBan {
  id: number;
  userId: string;
  username: string | null;
  reason: string;
  issuedBy: string;
  issuedAt: number;
  results: string;
  liftedBy: string | null;
  liftedAt: number | null;
  liftReason: string | null;
}

const directory = process.env.DATA_DIR ?? join(homedir(), ".naramo-faction");
mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(join(directory, "naramo.db"));

db.exec(`
  create table if not exists global_bans (
    id integer primary key,
    user_id text not null,
    username text,
    reason text not null,
    issued_by text not null,
    issued_at integer not null,
    results text not null default '',
    lifted_by text,
    lifted_at integer,
    lift_reason text
  );
  create index if not exists global_bans_user on global_bans (user_id, issued_at);
`);

const columns = `id, user_id as userId, username, reason, issued_by as issuedBy, issued_at as issuedAt, results,
  lifted_by as liftedBy, lifted_at as liftedAt, lift_reason as liftReason`;

const activeStatement = db.prepare(`select ${columns} from global_bans where user_id = ? and lifted_at is null order by issued_at desc limit 1`);
const historyStatement = db.prepare(`select ${columns} from global_bans where user_id = ? order by issued_at desc`);
const insertStatement = db.prepare("insert into global_bans (user_id, username, reason, issued_by, issued_at, results) values (?, ?, ?, ?, ?, ?)");
const liftStatement = db.prepare("update global_bans set lifted_by = ?, lifted_at = ?, lift_reason = ? where id = ? and lifted_at is null");
const countStatement = db.prepare("select count(*) as total, sum(lifted_at is null) as active from global_bans");

export const activeGlobalBan = (userId: string): GlobalBan | undefined => activeStatement.get(userId) as GlobalBan | undefined;

export const globalBanHistory = (userId: string): GlobalBan[] => historyStatement.all(userId) as unknown as GlobalBan[];

export const recordGlobalBan = (ban: { userId: string; username: string | null; reason: string; issuedBy: string; results: string }): void => {
  insertStatement.run(ban.userId, ban.username, ban.reason, ban.issuedBy, Date.now(), ban.results);
};

export const liftGlobalBan = (id: number, liftedBy: string, reason: string): boolean =>
  Number(liftStatement.run(liftedBy, Date.now(), reason, id).changes) > 0;

export const globalBanCounts = (): { total: number; active: number } => {
  const row = countStatement.get() as { total: number; active: number | null };
  return { total: Number(row.total), active: Number(row.active ?? 0) };
};
