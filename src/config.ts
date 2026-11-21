// TimorousShadow
import config from "../config.json" with { type: "json" };

export interface ServerEntry {
  id: string;
  name: string;
}

export const MAIN_GUILD_ID: string = config.mainGuildId;
export const GLOBAL_BAN_ROLE_ID: string = config.globalBan.roleId;
export const GLOBAL_BAN_LOG_CHANNEL_ID: string = config.globalBan.logChannelId;
export const SERVERS: readonly ServerEntry[] = config.servers;
