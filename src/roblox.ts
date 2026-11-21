// TimorousShadow
export interface RobloxAccount {
  id: string;
  name: string;
  displayName: string;
  created: number;
}

export type RobloxLookup = { status: "linked"; account: RobloxAccount } | { status: "unlinked" } | { status: "unavailable" };

const getJson = async (url: string, headers: Record<string, string> = {}): Promise<unknown> => {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
};

export const robloxConfigured = (): boolean => Boolean(process.env.BLOXLINK_API_KEY && process.env.BLOXLINK_GUILD_ID);

export const robloxForDiscord = async (discordId: string): Promise<RobloxLookup> => {
  const { BLOXLINK_API_KEY, BLOXLINK_GUILD_ID } = process.env;
  if (!BLOXLINK_API_KEY || !BLOXLINK_GUILD_ID) return { status: "unavailable" };
  try {
    const link = (await getJson(`https://api.blox.link/v4/public/guilds/${BLOXLINK_GUILD_ID}/discord-to-roblox/${discordId}`, { Authorization: BLOXLINK_API_KEY })) as { robloxID?: string } | null;
    if (!link?.robloxID) return { status: "unlinked" };
    const user = (await getJson(`https://users.roblox.com/v1/users/${link.robloxID}`)) as { id: number; name: string; displayName: string; created: string } | null;
    if (!user) return { status: "unlinked" };
    return { status: "linked", account: { id: String(user.id), name: user.name, displayName: user.displayName, created: Date.parse(user.created) } };
  } catch {
    return { status: "unavailable" };
  }
};
