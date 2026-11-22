// TimorousShadow
export interface PublicServer {
  id: string;
  playing: number;
  maxPlayers: number;
  fps: number;
  ping: number;
}

export interface ServerDetails {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  datacenterId: number | null;
  placeVersion: number | null;
  firstSeen: number | null;
}

export interface GameStats {
  playing: number;
  visits: number;
  favorites: number;
  upVotes: number;
  downVotes: number;
  updated: number | null;
}

const getJson = async (url: string | URL): Promise<unknown> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${new URL(url).host} returned ${response.status}`);
  return response.json();
};

export const publicServers = async (placeId: string): Promise<PublicServer[]> => {
  const servers = new Map<string, PublicServer>();
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 50; page += 1) {
    const url = new URL(`https://games.roblox.com/v1/games/${placeId}/servers/Public`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("sortOrder", "Desc");
    if (cursor) url.searchParams.set("cursor", cursor);
    const body = (await getJson(url)) as { nextPageCursor: string | null; data: PublicServer[] };
    for (const server of body.data ?? []) {
      if (typeof server.id !== "string") continue;
      servers.set(server.id, { id: server.id, playing: Number(server.playing) || 0, maxPlayers: Number(server.maxPlayers) || 0, fps: Number(server.fps) || 0, ping: Number(server.ping) || 0 });
    }
    cursor = body.nextPageCursor;
    if (!cursor) return [...servers.values()];
    if (seen.has(cursor)) throw new Error("Roblox server list pagination did not advance");
    seen.add(cursor);
  }
  throw new Error("Roblox server list went past 50 pages");
};

export const serverDetails = async (placeId: string, ids: readonly string[]): Promise<Map<string, ServerDetails>> => {
  const details = new Map<string, ServerDetails>();
  for (let offset = 0; offset < ids.length; offset += 40) {
    const url = new URL("https://apis.rovalra.com/v1/servers/details");
    url.searchParams.set("place_id", placeId);
    url.searchParams.set("server_ids", ids.slice(offset, offset + 40).join(","));
    const body = (await getJson(url)) as { servers?: Record<string, unknown>[] };
    for (const entry of body.servers ?? []) {
      const text = (key: string) => (typeof entry[key] === "string" && entry[key] ? (entry[key] as string) : null);
      const number = (key: string) => (typeof entry[key] === "number" ? (entry[key] as number) : null);
      const id = text("server_id");
      if (!id) continue;
      const firstSeen = text("first_seen");
      details.set(id, {
        city: text("city"),
        region: text("region"),
        country: text("country"),
        countryCode: text("region_code")?.slice(0, 2).toUpperCase() ?? null,
        datacenterId: number("datacenter_id"),
        placeVersion: number("place_version"),
        firstSeen: firstSeen ? Date.parse(firstSeen) : null,
      });
    }
  }
  return details;
};

let universeId: string | null = null;

export const gameStats = async (placeId: string): Promise<GameStats> => {
  if (!universeId) universeId = String(((await getJson(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`)) as { universeId: number }).universeId);
  const [games, votes] = await Promise.all([
    getJson(`https://games.roblox.com/v1/games?universeIds=${universeId}`) as Promise<{ data: { playing: number; visits: number; favoritedCount: number; updated: string }[] }>,
    getJson(`https://games.roblox.com/v1/games/votes?universeIds=${universeId}`) as Promise<{ data: { upVotes: number; downVotes: number }[] }>,
  ]);
  const game = games.data[0];
  const vote = votes.data[0];
  if (!game) throw new Error("Roblox returned no game for this universe");
  return {
    playing: game.playing,
    visits: game.visits,
    favorites: game.favoritedCount,
    upVotes: vote?.upVotes ?? 0,
    downVotes: vote?.downVotes ?? 0,
    updated: game.updated ? Date.parse(game.updated) : null,
  };
};
