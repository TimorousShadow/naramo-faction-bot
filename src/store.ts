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

export const dataDirectory = process.env.DATA_DIR ?? join(homedir(), ".naramo-faction");
const directory = dataDirectory;
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
  create table if not exists account_age_allow (
    user_id text primary key,
    added_by text not null,
    added_at integer not null,
    reason text not null
  );
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

export interface AllowedAccount {
  userId: string;
  addedBy: string;
  addedAt: number;
  reason: string;
}

const allowColumns = "user_id as userId, added_by as addedBy, added_at as addedAt, reason";
const allowedStatement = db.prepare(`select ${allowColumns} from account_age_allow where user_id = ?`);
const allowListStatement = db.prepare(`select ${allowColumns} from account_age_allow order by added_at desc`);
const allowStatement = db.prepare("insert or replace into account_age_allow (user_id, added_by, added_at, reason) values (?, ?, ?, ?)");
const disallowStatement = db.prepare("delete from account_age_allow where user_id = ?");

export const allowedAccount = (userId: string): AllowedAccount | undefined => allowedStatement.get(userId) as AllowedAccount | undefined;

export const allowedAccounts = (): AllowedAccount[] => allowListStatement.all() as unknown as AllowedAccount[];

export const allowAccount = (userId: string, addedBy: string, reason: string): void => {
  allowStatement.run(userId, addedBy, Date.now(), reason);
};

export const disallowAccount = (userId: string): boolean => Number(disallowStatement.run(userId).changes) > 0;
