// TimorousShadow
import { escapeMarkdown } from "discord.js";

export type CheckState = "flagged" | "pending" | "clear" | "error" | "skipped";

export interface CheckResult {
  name: string;
  state: CheckState;
  text: string;
  details?: string[];
}

export interface LinkedAccount {
  id: string;
  flagged: boolean;
  sources: string[];
}

export interface WatcherGuild {
  id: string;
  name: string;
  guildTypes?: { name?: string; description?: string }[];
  guildFlags?: string[];
  detectionVersion?: number;
  score?: number | null;
  guildJoins?: string[];
  guildLeaves?: string[];
  estimatedJoin?: string | null;
  firstSeen?: string | null;
  lastSeen?: string | null;
  lastActivity?: string | null;
  activity?: Record<string, number> | null;
  roles?: { id: string; name: string; permissions?: string[]; type?: string | null }[];
  membership?: (Record<string, unknown> & { allTimePermissions?: string[] }) | null;
}

export interface WatcherData {
  flagged: boolean;
  totalScore: number;
  guilds: WatcherGuild[];
}

export interface SafetyReport {
  checks: CheckResult[];
  linkedDiscord: LinkedAccount[];
  robloxWatcher: WatcherData | null;
  exploitWatcher: WatcherData | null;
}

const TIMEOUT = 10_000;

const request = async (url: string, headers: Record<string, string>): Promise<{ status: number; body: unknown }> => {
  const response = await fetch(url, { headers: { Accept: "application/json", ...headers }, redirect: "error", signal: AbortSignal.timeout(TIMEOUT) });
  if (response.headers.get("cf-mitigated") === "challenge" || (response.status === 403 && response.headers.get("content-type")?.includes("text/html")))
    throw new Error(`${new URL(url).hostname} blocked the server with a Cloudflare challenge`);
  const body: unknown = await response.json().catch(() => null);
  return { status: response.status, body };
};

const httpError = (service: string, status: number): Error =>
  new Error(status === 401 || status === 403 ? `${service} rejected the API key` : status === 429 ? `${service} rate limit reached` : `${service} returned ${status}`);

const settle = async (name: string, run: () => Promise<Omit<CheckResult, "name">>): Promise<CheckResult> => {
  try {
    return { name, ...(await run()) };
  } catch (error) {
    return { name, state: "error", text: error instanceof Error ? error.message : "lookup failed" };
  }
};

const skipped = (name: string, text: string): Promise<CheckResult> => Promise.resolve({ name, state: "skipped", text });

const code = (value: number | string): string => `\`${typeof value === "number" ? value.toLocaleString("en-US") : value}\``;

const when = (value: number | string | null | undefined, style: "R" | "D" | "f" = "R"): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const ms = typeof value === "number" ? (value > 1e12 ? value : value * 1000) : Date.parse(value);
  return Number.isNaN(ms) ? null : `<t:${Math.floor(ms / 1000)}:${style}>`;
};

const clean = (text: string, max = 80): string => {
  const value = escapeMarkdown(text.replace(/(?:https?:\/\/)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/\S+/gi, "[invite]").replace(/\s+/g, " ").trim());
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

const MAX_EVIDENCE = 500;

interface Evidence {
  kind?: string;
  text?: string;
  name?: string | null;
  description?: string;
  category?: string;
  outfitId?: string | null;
  discordId?: string;
  serverId?: string;
  safeName?: string;
  types?: string[];
  tags?: string[];
  messages?: number;
  typing?: number;
  reactions?: number;
  vcJoins?: number;
  joinedAt?: number | null;
  firstSeen?: number | null;
  lastSeen?: number | null;
  leftAt?: number | null;
  verifiedLeft?: boolean;
  staff?: boolean;
  booster?: boolean;
}

const evidenceLine = (item: Evidence): string => {
  if (item.kind === "discordGuild") {
    const head = [`**${clean(item.safeName || item.name || "Unknown server")}**`, item.serverId ? code(item.serverId) : "", (item.types ?? []).map((type) => code(type)).join(" ")].filter(Boolean).join(" ");
    const facts = [
      item.messages ? `${code(item.messages)} messages` : "",
      item.typing ? `${code(item.typing)} typing` : "",
      item.reactions ? `${code(item.reactions)} reactions` : "",
      item.vcJoins ? `${code(item.vcJoins)} VC joins` : "",
      item.staff ? "staff" : "",
      item.booster ? "booster" : "",
      when(item.joinedAt, "D") ? `joined ${when(item.joinedAt, "D")}` : "",
      when(item.firstSeen, "D") ? `first seen ${when(item.firstSeen, "D")}` : "",
      when(item.lastSeen) ? `last seen ${when(item.lastSeen)}` : "",
      when(item.leftAt) ? `left ${when(item.leftAt)}${item.verifiedLeft ? " (verified)" : ""}` : "",
      (item.tags ?? []).length ? `tags ${(item.tags ?? []).map((tag) => code(tag)).join(" ")}` : "",
    ].filter(Boolean);
    return `- ${head}${facts.length ? `\n  -# ${facts.join(" · ")}` : ""}`;
  }
  if (item.kind === "discordUser") return `- Linked Discord account ${code(item.discordId ?? "unknown")}`;
  if (item.kind === "outfit") return `- Outfit ${code(clean(item.name || "unnamed", 60))}${item.outfitId ? ` ${code(item.outfitId)}` : ""}${item.category ? ` · ${item.category}` : ""}`;
  const label = (item.kind ?? "evidence").replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
  const value = item.text || item.name || item.description || item.category || "";
  return `- ${label}${value ? `: ${clean(value, 180)}` : ""}`;
};

const safeUrl = (value?: string): string | null => {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
};

const RAYWARD_PROVIDERS = [
  ["rotector", "Rotector"],
  ["serversweep", "ServerSweep"],
  ["okappiki", "Okappiki"],
  ["rab", "RAB"],
  ["tase", "TASE"],
] as const;

const RAYWARD_LABELS: Record<number, string> = { 1: "Flagged", 2: "Confirmed", 3: "Queued", 4: "Provisional flag", 5: "Mixed", 6: "Past offender", 8: "Redacted", 10: "Awaiting human review" };

interface RaywardBody {
  data?: {
    flagType?: number | string;
    statusLabel?: string;
    headerMessage?: string;
    categoryLabel?: string;
    lastUpdated?: number;
    processedAt?: number;
    reviewer?: { username?: string; displayName?: string };
    reasons?: { type?: string; title?: string; sources?: { label?: string; summary?: string; credit?: string }[]; evidence?: Evidence[] }[];
  };
}

const rayward = (robloxId: string, provider: string, label: string) =>
  settle(`${label} via Rayward`, async () => {
    const { status, body } = await request(`https://roscoe.rayward.app/v2/lookup/${provider}/roblox/user/${robloxId}?excludeInfo=false`, { Authorization: `Bearer ${process.env.RAYWARD_API_KEY}` });
    if (status !== 200) throw httpError("Rayward", status);
    const data = (body as RaywardBody).data;
    const flagType = Number(data?.flagType ?? 0);
    if (flagType === 0) return { state: "clear", text: "not flagged" };
    const classification = data?.statusLabel?.trim() || RAYWARD_LABELS[flagType] || `classification ${flagType}`;
    const reasons = (data?.reasons ?? []).map((reason) => reason.title).filter(Boolean).slice(0, 3).join(", ");
    const meta = [
      data?.categoryLabel ? `Category ${code(data.categoryLabel)}` : "",
      data?.reviewer?.displayName ? `Reviewed by ${clean(data.reviewer.displayName, 40)}` : "",
      when(data?.lastUpdated) ? `Updated ${when(data?.lastUpdated)}` : "",
      when(data?.processedAt) ? `Processed ${when(data?.processedAt)}` : "",
    ].filter(Boolean);
    const details = [
      ...(data?.headerMessage ? [`> ${clean(data.headerMessage, 300)}`] : []),
      `Status ${code(classification)}${meta.length ? ` · ${meta.join(" · ")}` : ""}`,
      ...(data?.reasons ?? []).flatMap((reason) => {
        const evidence = reason.evidence ?? [];
        const sources = (reason.sources ?? []).map((source) => [source.label, source.summary, source.credit ? `credit ${source.credit}` : ""].filter(Boolean).join(": ")).filter(Boolean);
        return [
          "",
          `**${clean(reason.title || reason.type || "Reason", 80)}**${evidence.length ? ` · ${code(evidence.length)} evidence item${evidence.length === 1 ? "" : "s"}` : ""}`,
          ...sources.map((source) => `-# Source: ${clean(source, 200)}`),
          ...evidence.slice(0, MAX_EVIDENCE).map(evidenceLine),
          ...(evidence.length > MAX_EVIDENCE ? [`-# and ${evidence.length - MAX_EVIDENCE} more`] : []),
        ];
      }),
    ];
    return { state: flagType === 3 || flagType === 10 ? "pending" : "flagged", text: `${code(classification)}${reasons ? ` ${reasons}` : ""}`, details };
  });

const fetchWatcher = async (product: "robloxwatcher" | "exploitwatcher", discordId: string): Promise<WatcherData> => {
  const service = product === "robloxwatcher" ? "Roblox Watcher" : "Exploit Watcher";
  const key = product === "robloxwatcher" ? process.env.ROBLOX_WATCHER_API_KEY : process.env.EXPLOIT_WATCHER_API_KEY;
  const { status, body } = await request(`https://api.robloxwatcher.com/api/v1/${product}/search/${discordId}`, { Authorization: `Bearer ${key}` });
  if (status !== 200) throw httpError(service, status);
  const data = body as Partial<WatcherData>;
  return { flagged: Boolean(data.flagged), totalScore: data.totalScore ?? 0, guilds: data.guilds ?? [] };
};

const watcherGuildLine = (guild: WatcherGuild): string => {
  const joins = guild.guildJoins ?? [];
  const leaves = guild.guildLeaves ?? [];
  const activity = Object.entries(guild.activity ?? {}).filter(([, value]) => typeof value === "number" && value > 0);
  const membership = Object.entries(guild.membership ?? {})
    .filter(([key, value]) => value === true && key !== "allTimePermissions")
    .map(([key]) => key.replace(/([A-Z])/g, " $1").toLowerCase());
  const head = [`**${clean(guild.name || "Unknown server")}**`, code(guild.id), ...(guild.guildTypes ?? []).map((type) => (type.name ? code(type.name) : "")), ...(guild.guildFlags ?? []).map((flag) => `*${flag}*`)].filter(Boolean).join(" ");
  const facts = [
    `score ${code(Math.round((guild.score ?? 0) * 100) / 100)}`,
    guild.detectionVersion ? `detection v${guild.detectionVersion}` : "",
    joins.length ? `joined ${joins.map((value) => when(value, "D")).filter(Boolean).join(", ")}` : when(guild.estimatedJoin, "D") ? `joined around ${when(guild.estimatedJoin, "D")}` : "join date unknown",
    leaves.length ? `left ${when(leaves.at(-1), "D")}` : "",
    when(guild.lastActivity) ? `last active ${when(guild.lastActivity)}` : "",
    ...activity.map(([key, value]) => `${code(value)} ${key.replace(/([A-Z])/g, " $1").toLowerCase()}`),
    ...membership,
    (guild.membership?.allTimePermissions ?? []).length ? `permissions ${(guild.membership?.allTimePermissions ?? []).map((permission) => code(permission)).join(" ")}` : "",
    (guild.roles ?? []).length ? `roles ${(guild.roles ?? []).map((role) => `${code(clean(role.name, 40))}${role.type ? ` (${role.type})` : ""}`).join(" ")}` : "",
  ].filter(Boolean);
  return `- ${head}\n  -# ${facts.join(" · ")}`;
};

const watcherDetails = (data: WatcherData): string[] => {
  const guilds = [...data.guilds].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const types = new Map<string, string>();
  for (const guild of guilds) for (const type of guild.guildTypes ?? []) if (type.name && type.description) types.set(type.name, type.description);
  const active = guilds.some((guild) => Object.values(guild.activity ?? {}).some((value) => typeof value === "number" && value > 0));
  return [
    `Total score ${code(Math.round(data.totalScore * 100) / 100)} across ${code(guilds.length)} server${guilds.length === 1 ? "" : "s"}${active ? "" : " · no recorded activity, flagged for membership only"}`,
    ...[...types.entries()].map(([name, description]) => `-# ${code(name)} ${clean(description, 200)}`),
    "",
    ...guilds.slice(0, MAX_EVIDENCE).map(watcherGuildLine),
    ...(guilds.length > MAX_EVIDENCE ? [`-# and ${guilds.length - MAX_EVIDENCE} more, see the server pages`] : []),
    "",
    "-# Detection v2 started around May 2026. Servers marked v1 come from older join logs and may have less detail.",
  ];
};

const watcherSummary = (data: WatcherData, kind: string): Omit<CheckResult, "name"> => {
  if (!data.flagged && data.guilds.length === 0) return { state: "clear", text: `no ${kind} servers` };
  const types = new Map<string, number>();
  for (const guild of data.guilds) for (const type of guild.guildTypes ?? []) if (type.name) types.set(type.name, (types.get(type.name) ?? 0) + 1);
  const breakdown = [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, total]) => `${name} ${total}`).join(", ");
  return {
    state: data.flagged ? "flagged" : "clear",
    text: `score ${code(Math.round(data.totalScore))} in ${code(data.guilds.length)} server${data.guilds.length === 1 ? "" : "s"}${breakdown ? `, ${breakdown}` : ""}`,
    details: watcherDetails(data),
  };
};

const linkedDiscordAccounts = async (robloxId: string): Promise<LinkedAccount[]> => {
  if (!process.env.ROBLOX_WATCHER_API_KEY) return [];
  try {
    const { status, body } = await request(`https://api.robloxwatcher.com/api/v1/robloxwatcher/roblox/search/${robloxId}`, { Authorization: `Bearer ${process.env.ROBLOX_WATCHER_API_KEY}` });
    if (status !== 200) return [];
    return ((body as { discordAccounts?: LinkedAccount[] }).discordAccounts ?? []).map((account) => ({ id: String(account.id), flagged: Boolean(account.flagged), sources: account.sources ?? [] }));
  } catch {
    return [];
  }
};

const simmer = (robloxId: string) =>
  settle("Simmer", async () => {
    const { status, body } = await request(`https://api.simmer.icu/v2/checkuser/${robloxId}`, { Authorization: `Bearer ${process.env.SIMMER_API_KEY}` });
    if (status === 404) return { state: "clear", text: "not in any flagged group" };
    if (status !== 200) throw httpError("Simmer", status);
    const data = body as { success?: boolean; groupCount?: number; groupTypes?: Record<string, { count?: number }> };
    if (!data.success || !data.groupCount) return { state: "clear", text: "not in any flagged group" };
    const entries = Object.entries(data.groupTypes ?? {});
    const types = entries.map(([name, value]) => `${name} ${value.count ?? 0}`).join(", ");
    const lastSeen = (data as { lastSeen?: string }).lastSeen;
    return {
      state: "flagged",
      text: `in ${code(data.groupCount)} flagged group${data.groupCount === 1 ? "" : "s"}${types ? `, ${types}` : ""}`,
      details: [
        `In ${code(data.groupCount)} flagged Roblox group${data.groupCount === 1 ? "" : "s"}${when(lastSeen) ? ` · last seen ${when(lastSeen)}` : ""}`,
        ...entries.map(([name, value]) => `- ${clean(name, 60)}: ${code(value.count ?? 0)}`),
      ],
    };
  });

const xTracker = (robloxId: string) =>
  settle("X Tracker", async () => {
    const headers = { Authorization: process.env.XTRACKER_API_KEY ?? "" };
    const [registry, ownership] = await Promise.all(["registry", "ownership"].map((path) => request(`https://api.xtracker.xyz/api/${path}/user?id=${robloxId}`, headers)));
    for (const [response, label] of [[registry!, "registry"], [ownership!, "ownership"]] as const)
      if (response.status !== 200 && response.status !== 404) throw httpError(`X Tracker ${label}`, response.status);
    const record = (registry!.status === 200 ? registry!.body : null) as { evidence?: { reason?: string; date?: string; url?: string }[]; alts?: unknown } | null;
    const entries = record?.evidence ?? [];
    const evidence = entries.map((entry) => entry.reason).filter((reason): reason is string => Boolean(reason));
    const altsRaw = typeof record?.alts === "string" ? (JSON.parse(record.alts || "[]") as unknown) : record?.alts;
    const alts = Array.isArray(altsRaw) ? altsRaw.length : 0;
    const owned = ((ownership!.status === 200 ? (ownership!.body as { owned_cheat?: unknown }).owned_cheat : null) ?? []) as unknown[];
    const hits = [
      ...(evidence.length ? [`${code(evidence.length)} registry ${evidence.length === 1 ? "entry" : "entries"}, ${evidence.slice(0, 2).join(", ")}`] : []),
      ...(alts ? [`${code(alts)} known alt${alts === 1 ? "" : "s"}`] : []),
      ...(owned.length ? [`owns ${owned.map((item) => code(String(item))).slice(0, 3).join(", ")}`] : []),
    ];
    const altIds = Array.isArray(altsRaw) ? altsRaw.map(String).filter((value) => /^\d{1,20}$/.test(value)) : [];
    const details = [
      ...(entries.length
        ? ["**Registry evidence**", ...entries.slice(0, MAX_EVIDENCE).map((entry) => `- ${clean(entry.reason ?? "No reason given", 160)}${entry.date ? ` · ${clean(entry.date, 40)}` : ""}${safeUrl(entry.url) ? ` · [evidence](${safeUrl(entry.url)})` : ""}`)]
        : []),
      ...(altIds.length ? ["", "**Known alts**", ...altIds.map((alt) => `- [${alt}](https://www.roblox.com/users/${alt}/profile)`)] : []),
      ...(owned.length ? ["", "**Owned cheats**", ...owned.map((item) => `- ${code(clean(String(item), 40))}`)] : []),
    ];
    return hits.length ? { state: "flagged", text: hits.join("; "), details } : { state: "clear", text: "no records" };
  });

const catWatcher = (robloxId: string) =>
  settle("Cat Watcher", async () => {
    const { status, body } = await request(`https://catwatcher.org/api/roblox/${robloxId}`, { "X-API-Key": process.env.CATWATCHER_API_KEY ?? "" });
    if (status === 404) return { state: "clear", text: "no cheater records" };
    if (status !== 200) throw httpError("Cat Watcher", status);
    const data = body as {
      recordCount?: number;
      summary?: { currentlyActive?: number; lastActivity?: string | null };
      linkedDiscordIds?: string[];
      records?: { discordId?: string; firstCaught?: string; lastChecked?: string; stillInServers?: boolean; currentServers?: string[]; previousServers?: string[]; caughtByAdmin?: string }[];
    };
    const records = Math.max(data.recordCount ?? 0, data.records?.length ?? 0);
    if (!records) return { state: "clear", text: "no cheater records" };
    const active = data.summary?.currentlyActive ?? 0;
    const list = (values?: string[]): string => (values ?? []).map((value) => code(clean(value, 40))).join(" ");
    const details = [
      `${code(records)} record${records === 1 ? "" : "s"}${active ? ` · ${code(active)} still in servers` : ""}${when(data.summary?.lastActivity) ? ` · last activity ${when(data.summary?.lastActivity)}` : ""}`,
      ...(data.records ?? []).flatMap((record, index) => [
        "",
        `**Record ${index + 1}**${record.discordId ? ` · Discord ${code(record.discordId)}` : ""}${record.stillInServers ? " · still in servers" : ""}`,
        [when(record.firstCaught, "D") ? `First caught ${when(record.firstCaught, "D")}` : "", when(record.lastChecked) ? `last checked ${when(record.lastChecked)}` : "", record.caughtByAdmin ? `caught by admin ${code(record.caughtByAdmin)}` : ""].filter(Boolean).join(" · "),
        ...((record.currentServers ?? []).length ? [`Now in: ${list(record.currentServers)}`] : []),
        ...((record.previousServers ?? []).length ? [`Previously in: ${list(record.previousServers)}`] : []),
      ]),
      ...((data.linkedDiscordIds ?? []).length ? ["", `Linked Discord accounts: ${(data.linkedDiscordIds ?? []).map((value) => code(value)).join(" ")}`] : []),
    ];
    return { state: "flagged", text: `${code(records)} cheater record${records === 1 ? "" : "s"}${active ? `, ${code(active)} still active` : ""}`, details };
  });

export const runSafetyChecks = async (discordId: string | null, robloxId: string | null): Promise<SafetyReport> => {
  const env = process.env;
  const needDiscord = "needs a Discord account";
  const needRoblox = "needs a Roblox account";
  const rw = discordId && env.ROBLOX_WATCHER_API_KEY ? fetchWatcher("robloxwatcher", discordId) : null;
  const ew = discordId && env.EXPLOIT_WATCHER_API_KEY ? fetchWatcher("exploitwatcher", discordId) : null;
  rw?.catch(() => undefined);
  ew?.catch(() => undefined);
  const watcherCheck = (name: string, kind: string, key: string | undefined, data: Promise<WatcherData> | null): Promise<CheckResult> =>
    !key ? skipped(name, "not configured") : !data ? skipped(name, needDiscord) : settle(name, async () => watcherSummary(await data, kind));
  const robloxCheck = (name: string, key: string | undefined, run: (id: string) => Promise<CheckResult>): Promise<CheckResult> =>
    !key ? skipped(name, "not configured") : robloxId ? run(robloxId) : skipped(name, needRoblox);

  const jobs = [
    ...RAYWARD_PROVIDERS.map(([provider, label]) => robloxCheck(`${label} via Rayward`, env.RAYWARD_API_KEY, (id) => rayward(id, provider, label))),
    watcherCheck("Roblox Watcher", "condo or NSFW", env.ROBLOX_WATCHER_API_KEY, rw),
    watcherCheck("Exploit Watcher", "exploit", env.EXPLOIT_WATCHER_API_KEY, ew),
    robloxCheck("Simmer", env.SIMMER_API_KEY, simmer),
    robloxCheck("X Tracker", env.XTRACKER_API_KEY, xTracker),
    robloxCheck("Cat Watcher", env.CATWATCHER_API_KEY, catWatcher),
  ];
  const [checks, linkedDiscord, robloxWatcher, exploitWatcher] = await Promise.all([
    Promise.all(jobs),
    robloxId ? linkedDiscordAccounts(robloxId) : Promise.resolve([]),
    rw?.catch(() => null) ?? Promise.resolve(null),
    ew?.catch(() => null) ?? Promise.resolve(null),
  ]);
  return { checks, linkedDiscord, robloxWatcher, exploitWatcher };
};

export const resolveRobloxUsername = async (input: string): Promise<{ id: string; name: string } | null> => {
  const value = input.trim();
  if (/^\d{1,20}$/.test(value)) {
    const response = await fetch(`https://users.roblox.com/v1/users/${value}`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!response.ok) return null;
    const user = (await response.json()) as { id: number; name: string };
    return { id: String(user.id), name: user.name };
  }
  const response = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [value], excludeBannedUsers: false }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!response.ok) return null;
  const user = ((await response.json()) as { data?: { id: number; name: string }[] }).data?.[0];
  return user ? { id: String(user.id), name: user.name } : null;
};
