// TimorousShadow
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDirectory } from "../store.js";
import type { GameStats, PublicServer, ServerDetails } from "./sources.js";

export interface ServerRow {
  jobId: string;
  playing: number;
  maxPlayers: number;
  fps: number;
  ping: number;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  datacenterId: number | null;
  placeVersion: number | null;
  firstSeen: number;
  lastSeen: number;
}

export interface FleetPoint {
  at: number;
  players: number;
  peak: number;
  servers: number;
  capacity: number;
  fps: number;
  ping: number;
}

export interface ServerPoint {
  at: number;
  playing: number;
  fps: number;
  ping: number;
}

export interface GameSample extends GameStats {
  at: number;
}

const HOUR = 3_600_000;
const db = new DatabaseSync(join(dataDirectory, "servers.db"));

db.exec(`
  pragma journal_mode = wal;
  create table if not exists servers (
    job_id text primary key,
    playing integer not null,
    max_players integer not null,
    fps real not null,
    ping integer not null,
    city text,
    region text,
    country text,
    country_code text,
    datacenter_id integer,
    place_version integer,
    first_seen integer not null,
    last_seen integer not null,
    active integer not null default 1
  );
  create table if not exists server_samples (
    job_id text not null,
    at integer not null,
    playing integer not null,
    fps real not null,
    ping integer not null,
    primary key (job_id, at)
  ) without rowid;
  create table if not exists fleet_samples (
    at integer primary key,
    players integer not null,
    servers integer not null,
    capacity integer not null,
    fps real not null,
    ping real not null
  );
  create table if not exists game_samples (
    at integer primary key,
    playing integer not null,
    visits integer not null,
    favorites integer not null,
    up_votes integer not null,
    down_votes integer not null,
    updated integer
  );
`);

const serverColumns = `job_id as jobId, playing, max_players as maxPlayers, fps, ping, city, region, country, country_code as countryCode,
  datacenter_id as datacenterId, place_version as placeVersion, first_seen as firstSeen, last_seen as lastSeen`;

const upsertServer = db.prepare(`
  insert into servers (job_id, playing, max_players, fps, ping, city, region, country, country_code, datacenter_id, place_version, first_seen, last_seen, active)
  values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  on conflict (job_id) do update set
    playing = excluded.playing, max_players = excluded.max_players, fps = excluded.fps, ping = excluded.ping,
    city = coalesce(excluded.city, servers.city), region = coalesce(excluded.region, servers.region),
    country = coalesce(excluded.country, servers.country), country_code = coalesce(excluded.country_code, servers.country_code),
    datacenter_id = coalesce(excluded.datacenter_id, servers.datacenter_id), place_version = coalesce(excluded.place_version, servers.place_version),
    first_seen = min(servers.first_seen, excluded.first_seen), last_seen = excluded.last_seen, active = 1`);
const insertSample = db.prepare("insert or ignore into server_samples (job_id, at, playing, fps, ping) values (?, ?, ?, ?, ?)");
const insertFleet = db.prepare("insert or replace into fleet_samples (at, players, servers, capacity, fps, ping) values (?, ?, ?, ?, ?, ?)");
const deactivate = db.prepare("update servers set active = 0 where active = 1 and last_seen < ?");
const pruneSamples = db.prepare("delete from server_samples where at < ?");
const pruneServers = db.prepare("delete from servers where active = 0 and last_seen < ?");
const insertGame = db.prepare("insert or replace into game_samples (at, playing, visits, favorites, up_votes, down_votes, updated) values (?, ?, ?, ?, ?, ?, ?)");
const knownDetails = db.prepare("select job_id as jobId from servers where job_id = ? and city is not null");

export const missingDetails = (ids: readonly string[]): string[] => ids.filter((id) => !knownDetails.get(id));

export const recordSnapshot = (at: number, servers: readonly PublicServer[], details: ReadonlyMap<string, ServerDetails>): void => {
  db.exec("begin");
  try {
    for (const server of servers) {
      const info = details.get(server.id);
      upsertServer.run(
        server.id, server.playing, server.maxPlayers, server.fps, server.ping,
        info?.city ?? null, info?.region ?? null, info?.country ?? null, info?.countryCode ?? null, info?.datacenterId ?? null, info?.placeVersion ?? null,
        info?.firstSeen ?? at, at,
      );
      insertSample.run(server.id, at, server.playing, server.fps, server.ping);
    }
    if (servers.length) {
      const players = servers.reduce((sum, server) => sum + server.playing, 0);
      const weighted = (key: "fps" | "ping") =>
        players ? servers.reduce((sum, server) => sum + server[key] * server.playing, 0) / players : servers.reduce((sum, server) => sum + server[key], 0) / servers.length;
      insertFleet.run(at, players, servers.length, servers.reduce((sum, server) => sum + server.maxPlayers, 0), weighted("fps"), weighted("ping"));
    }
    deactivate.run(at);
    pruneSamples.run(at - 48 * HOUR);
    pruneServers.run(at - 48 * HOUR);
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
};

export const recordGame = (at: number, stats: GameStats): void => {
  insertGame.run(at, stats.playing, stats.visits, stats.favorites, stats.upVotes, stats.downVotes, stats.updated);
};

export const activeServers = (): ServerRow[] =>
  db.prepare(`select ${serverColumns} from servers where active = 1 order by playing desc, ping asc`).all() as unknown as ServerRow[];

export const serverByPrefix = (fragment: string): ServerRow[] =>
  db.prepare(`select ${serverColumns} from servers where active = 1 and job_id like ? order by playing desc`).all(`%${fragment.replace(/[%_]/g, "")}%`) as unknown as ServerRow[];

export const serverRow = (jobId: string): ServerRow | undefined =>
  db.prepare(`select ${serverColumns} from servers where job_id = ?`).get(jobId) as ServerRow | undefined;

export const fleetSeries = (from: number, to: number, bucket: number): FleetPoint[] =>
  db
    .prepare(
      `select (at / ?) * ? as at, avg(players) as players, max(players) as peak, avg(servers) as servers, avg(capacity) as capacity, avg(fps) as fps, avg(ping) as ping
       from fleet_samples where at >= ? and at < ? group by at / ? order by 1`,
    )
    .all(bucket, bucket, from, to, bucket) as unknown as FleetPoint[];

export const serverSeries = (jobId: string): ServerPoint[] =>
  db.prepare("select at, playing, fps, ping from server_samples where job_id = ? order by at").all(jobId) as unknown as ServerPoint[];

export const fleetPeak = (from: number): { at: number; players: number } | undefined =>
  db.prepare("select at, players from fleet_samples where at >= ? order by players desc, at desc limit 1").get(from) as { at: number; players: number } | undefined;

export const fleetAt = (at: number, window = 5 * 60_000): FleetPoint | undefined =>
  db.prepare("select at, players, players as peak, servers, capacity, fps, ping from fleet_samples where at between ? and ? order by abs(at - ?) limit 1").get(at - window, at + window, at) as FleetPoint | undefined;

export const trackingSince = (): number | null => {
  const row = db.prepare("select min(at) as first from fleet_samples").get() as { first: number | null };
  return row.first;
};

export const gameLatest = (): GameSample | undefined => gameAtOrBefore(Date.now());

export const gameAtOrBefore = (at: number): GameSample | undefined =>
  db
    .prepare("select at, playing, visits, favorites, up_votes as upVotes, down_votes as downVotes, updated from game_samples where at <= ? order by at desc limit 1")
    .get(at) as GameSample | undefined;

export const hourlyAverages = (from: number): { at: number; players: number }[] =>
  db.prepare("select (at / 3600000) * 3600000 as at, avg(players) as players from fleet_samples where at >= ? group by at / 3600000 order by 1").all(from) as unknown as {
    at: number;
    players: number;
  }[];
