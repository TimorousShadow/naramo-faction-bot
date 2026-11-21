// TimorousShadow
import config from "../config.json" with { type: "json" };

export interface ServerEntry {
  id: string;
  name: string;
}

export const MAIN_GUILD_ID: string = config.mainGuildId;
export const ADMIN_ROLE_ID: string = config.adminRoleId;
export const WATCHER_CHANNEL_ID: string = config.watcherChannelId;
export const GLOBAL_BAN_ROLE_ID: string = config.globalBan.roleId;
export const GLOBAL_BAN_LOG_CHANNEL_ID: string = config.globalBan.logChannelId;
export const PROTECTED_GUILD_IDS: ReadonlySet<string> = new Set(config.protectedGuilds.map((guild) => guild.id));
export const SERVERS: readonly ServerEntry[] = config.servers.filter((server) => !PROTECTED_GUILD_IDS.has(server.id));
