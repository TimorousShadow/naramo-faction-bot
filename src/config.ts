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
export const GAME_PLACE_ID: string = config.game.placeId;
export const GAME_NAME: string = config.game.name;
export const PROTECTED_GUILD_IDS: ReadonlySet<string> = new Set(config.protectedGuilds.map((guild) => guild.id));
export const SERVERS: readonly ServerEntry[] = config.servers.filter((server) => !PROTECTED_GUILD_IDS.has(server.id));

export const commandAccessMinRoles = (guildId: string | null, command: string): readonly string[] =>
  config.commandAccess.filter((rule) => rule.guildId === guildId && rule.command === command && rule.minRoleId).map((rule) => rule.minRoleId as string);

export const commandAccessRoles = (guildId: string | null, command: string): readonly string[] =>
  config.commandAccess.filter((rule) => rule.guildId === guildId && rule.command === command).flatMap((rule) => rule.roles);

export const extraCommandsFor = (guildId: string): readonly string[] => config.commandAccess.filter((rule) => rule.guildId === guildId).map((rule) => rule.command);
