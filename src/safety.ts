// TimorousShadow
export type CheckState = "flagged" | "pending" | "clear" | "error" | "skipped";

export interface CheckResult {
  name: string;
  state: CheckState;
  text: string;
}

export interface LinkedAccount {
  id: string;
  flagged: boolean;
}

export interface SafetyReport {
  checks: CheckResult[];
  linkedDiscord: LinkedAccount[];
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

const skipped = (name: string, text: string): CheckResult => ({ name, state: "skipped", text });

const count = (value: number, word: string): string => `${value.toLocaleString("en-US")} ${word}${value === 1 ? "" : "s"}`;

const RAYWARD_PROVIDERS = [
  ["rotector", "Rotector"],
  ["serversweep", "ServerSweep"],
  ["okappiki", "Okappiki"],
  ["rab", "RAB"],
  ["tase", "TASE"],
] as const;

const RAYWARD_LABELS: Record<number, string> = { 1: "Flagged", 2: "Confirmed", 3: "Queued", 4: "Provisional flag", 5: "Mixed", 6: "Past offender", 8: "Redacted", 10: "Awaiting human review" };

interface RaywardBody {
  success?: boolean;
  data?: { flagType?: number | string; statusLabel?: string; reasons?: { title?: string }[] };
}

const rayward = (robloxId: string, provider: string, label: string) =>
  settle(`${label} via Rayward`, async () => {
    const { status, body } = await request(`https://roscoe.rayward.app/v2/lookup/${provider}/roblox/user/${robloxId}?excludeInfo=true`, { Authorization: `Bearer ${process.env.RAYWARD_API_KEY}` });
    if (status !== 200) throw httpError("Rayward", status);
    const data = (body as RaywardBody).data;
    const flagType = Number(data?.flagType ?? 0);
    if (flagType === 0) return { state: "clear", text: "not flagged" };
    const label = data?.statusLabel?.trim() || RAYWARD_LABELS[flagType] || `classification ${flagType}`;
    const reasons = (data?.reasons ?? []).map((reason) => reason.title).filter(Boolean).slice(0, 3).join(", ");
    return { state: flagType === 3 || flagType === 10 ? "pending" : "flagged", text: reasons ? `${label} (${reasons})` : label };
  });

interface WatcherGuild {
  guildTypes?: { name?: string }[];
  score?: number | null;
}

interface WatcherBody {
  flagged?: boolean;
  totalScore?: number;
  guilds?: WatcherGuild[];
}

const watcherSummary = (body: WatcherBody, kind: string): Omit<CheckResult, "name"> => {
  const guilds = body.guilds ?? [];
  if (!body.flagged && guilds.length === 0) return { state: "clear", text: `no ${kind} servers found` };
  const types = new Map<string, number>();
  for (const guild of guilds) for (const type of guild.guildTypes ?? []) if (type.name) types.set(type.name, (types.get(type.name) ?? 0) + 1);
  const breakdown = [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, total]) => `${name} ${total}`).join(", ");
  const score = Math.round(body.totalScore ?? 0).toLocaleString("en-US");
  return { state: body.flagged ? "flagged" : "clear", text: `score ${score} across ${count(guilds.length, "server")}${breakdown ? ` (${breakdown})` : ""}` };
};

const robloxWatcher = (discordId: string) =>
  settle("Roblox Watcher", async () => {
    const { status, body } = await request(`https://api.robloxwatcher.com/api/v1/robloxwatcher/search/${discordId}`, { Authorization: `Bearer ${process.env.ROBLOX_WATCHER_API_KEY}` });
    if (status !== 200) throw httpError("Roblox Watcher", status);
    return watcherSummary(body as WatcherBody, "condo or NSFW");
  });

const exploitWatcher = (discordId: string) =>
  settle("Exploit Watcher", async () => {
    const { status, body } = await request(`https://api.robloxwatcher.com/api/v1/exploitwatcher/search/${discordId}`, { Authorization: `Bearer ${process.env.EXPLOIT_WATCHER_API_KEY}` });
    if (status !== 200) throw httpError("Exploit Watcher", status);
    return watcherSummary(body as WatcherBody, "exploit");
  });

const linkedDiscordAccounts = async (robloxId: string): Promise<LinkedAccount[]> => {
  if (!process.env.ROBLOX_WATCHER_API_KEY) return [];
  try {
    const { status, body } = await request(`https://api.robloxwatcher.com/api/v1/robloxwatcher/roblox/search/${robloxId}`, { Authorization: `Bearer ${process.env.ROBLOX_WATCHER_API_KEY}` });
    if (status !== 200) return [];
    return ((body as { discordAccounts?: LinkedAccount[] }).discordAccounts ?? []).map((account) => ({ id: String(account.id), flagged: Boolean(account.flagged) }));
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
    const types = Object.entries(data.groupTypes ?? {}).map(([name, value]) => `${name} ${value.count ?? 0}`).join(", ");
    return { state: "flagged", text: `in ${count(data.groupCount, "flagged group")}${types ? ` (${types})` : ""}` };
  });

const xTracker = (robloxId: string) =>
  settle("X Tracker", async () => {
    const headers = { Authorization: process.env.XTRACKER_API_KEY ?? "" };
    const [registry, ownership] = await Promise.all(
      ["registry", "ownership"].map((path) => request(`https://api.xtracker.xyz/api/${path}/user?id=${robloxId}`, headers)),
    );
    for (const [response, label] of [[registry!, "registry"], [ownership!, "ownership"]] as const)
      if (response.status !== 200 && response.status !== 404) throw httpError(`X Tracker ${label}`, response.status);
    const record = (registry!.status === 200 ? registry!.body : null) as { evidence?: { reason?: string }[]; alts?: unknown } | null;
    const evidence = (record?.evidence ?? []).map((entry) => entry.reason).filter((reason): reason is string => Boolean(reason));
    const altsRaw = typeof record?.alts === "string" ? (JSON.parse(record.alts || "[]") as unknown) : record?.alts;
    const alts = Array.isArray(altsRaw) ? altsRaw.length : 0;
    const owned = ((ownership!.status === 200 ? (ownership!.body as { owned_cheat?: unknown }).owned_cheat : null) ?? []) as unknown[];
    const hits = [
      ...(evidence.length ? [`${evidence.length} registry ${evidence.length === 1 ? "entry" : "entries"} (${evidence.slice(0, 2).join(", ")})`] : []),
      ...(alts ? [count(alts, "known alt")] : []),
      ...(owned.length ? [`owns ${owned.map(String).slice(0, 3).join(", ")}`] : []),
    ];
    return hits.length ? { state: "flagged", text: hits.join("; ") } : { state: "clear", text: "no records" };
  });

const catWatcher = (robloxId: string) =>
  settle("Cat Watcher", async () => {
    const { status, body } = await request(`https://catwatcher.org/api/roblox/${robloxId}`, { "X-API-Key": process.env.CATWATCHER_API_KEY ?? "" });
    if (status === 404) return { state: "clear", text: "no cheater records" };
    if (status !== 200) throw httpError("Cat Watcher", status);
    const data = body as { recordCount?: number; summary?: { currentlyActive?: number } };
    const records = data.recordCount ?? 0;
    if (!records) return { state: "clear", text: "no cheater records" };
    const active = data.summary?.currentlyActive ?? 0;
    return { state: "flagged", text: `${count(records, "cheater record")}${active ? `, ${active} still active` : ""}` };
  });

export const runSafetyChecks = async (discordId: string | null, robloxId: string | null): Promise<SafetyReport> => {
  const env = process.env;
  const needDiscord = "needs a Discord account";
  const needRoblox = "needs a Roblox account";
  const jobs: Promise<CheckResult>[] = [
    ...RAYWARD_PROVIDERS.map(([provider, label]) =>
      !env.RAYWARD_API_KEY ? Promise.resolve(skipped(`${label} via Rayward`, "not configured")) : robloxId ? rayward(robloxId, provider, label) : Promise.resolve(skipped(`${label} via Rayward`, needRoblox)),
    ),
    !env.ROBLOX_WATCHER_API_KEY ? Promise.resolve(skipped("Roblox Watcher", "not configured")) : discordId ? robloxWatcher(discordId) : Promise.resolve(skipped("Roblox Watcher", needDiscord)),
    !env.EXPLOIT_WATCHER_API_KEY ? Promise.resolve(skipped("Exploit Watcher", "not configured")) : discordId ? exploitWatcher(discordId) : Promise.resolve(skipped("Exploit Watcher", needDiscord)),
    !env.SIMMER_API_KEY ? Promise.resolve(skipped("Simmer", "not configured")) : robloxId ? simmer(robloxId) : Promise.resolve(skipped("Simmer", needRoblox)),
    !env.XTRACKER_API_KEY ? Promise.resolve(skipped("X Tracker", "not configured")) : robloxId ? xTracker(robloxId) : Promise.resolve(skipped("X Tracker", needRoblox)),
    !env.CATWATCHER_API_KEY ? Promise.resolve(skipped("Cat Watcher", "not configured")) : robloxId ? catWatcher(robloxId) : Promise.resolve(skipped("Cat Watcher", needRoblox)),
  ];
  const [checks, linkedDiscord] = await Promise.all([Promise.all(jobs), robloxId ? linkedDiscordAccounts(robloxId) : Promise.resolve([])]);
  return { checks, linkedDiscord };
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
