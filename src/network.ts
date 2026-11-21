// TimorousShadow
import { AuditLogEvent, DiscordAPIError, RESTJSONErrorCodes, type Client, type ContainerBuilder, type Guild } from "discord.js";
import { GLOBAL_BAN_LOG_CHANNEL_ID, SERVERS, type ServerEntry } from "./config.js";
import { v2 } from "./ui.js";

export interface ServerBan {
  server: ServerEntry;
  guild: Guild | null;
  state: "banned" | "clear" | "missing" | "unknown";
  reason: string | null;
  moderatorId: string | null;
}

export const isUnknownBan = (error: unknown): boolean => error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownBan;

export const failureText = (error: unknown): string => {
  if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.MissingPermissions) return "missing permission or role too low";
  return error instanceof DiscordAPIError ? error.message : "unknown error";
};

const banModerator = async (guild: Guild, userId: string): Promise<string | null> => {
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 100 }).catch(() => null);
  return logs?.entries.find((entry) => entry.targetId === userId)?.executorId ?? null;
};

export const checkBans = (client: Client, userId: string): Promise<ServerBan[]> =>
  Promise.all(
    SERVERS.map(async (server): Promise<ServerBan> => {
      const guild = client.guilds.cache.get(server.id) ?? null;
      if (!guild) return { server, guild, state: "missing", reason: null, moderatorId: null };
      try {
        const ban = await guild.bans.fetch({ user: userId, force: true });
        return { server, guild, state: "banned", reason: ban.reason ?? null, moderatorId: await banModerator(guild, userId) };
      } catch (error) {
        return { server, guild, state: isUnknownBan(error) ? "clear" : "unknown", reason: null, moderatorId: null };
      }
    }),
  );

export const banLine = (ban: ServerBan): string => {
  if (ban.state === "missing") return `- ${ban.server.name}: bot not added yet`;
  if (ban.state === "unknown") return `- ${ban.server.name}: couldn't check`;
  if (ban.state === "clear") return `- ${ban.server.name}: not banned`;
  const by = ban.moderatorId ? ` by <@${ban.moderatorId}>` : "";
  return `- ${ban.server.name}: banned${by}${ban.reason ? `\n-# ${ban.reason.slice(0, 180)}` : ""}`;
};

export const postLog = async (client: Client, container: ContainerBuilder): Promise<void> => {
  const channel = await client.channels.fetch(GLOBAL_BAN_LOG_CHANNEL_ID).catch(() => null);
  if (!channel?.isSendable()) {
    console.error("Global ban log channel is not reachable");
    return;
  }
  await channel.send({ components: [container], flags: v2, allowedMentions: { parse: [] } }).catch((error: unknown) => console.error("Global ban log failed", error));
};

export const userLabel = async (client: Client, userId: string): Promise<{ text: string; username: string | null }> => {
  const user = await client.users.fetch(userId).catch(() => null);
  return { text: user ? `${user.username} \`${user.id}\`` : `\`${userId}\``, username: user?.username ?? null };
};
