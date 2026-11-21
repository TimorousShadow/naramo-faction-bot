// TimorousShadow
import { REST, Routes } from "discord.js";
import { banlistCommand } from "./commands/banlist.js";
import { gbaninfoCommand } from "./commands/gbaninfo.js";
import { globalbanCommand } from "./commands/globalban.js";
import { globalunbanCommand } from "./commands/globalunban.js";
import { helpCommand } from "./commands/help-definition.js";
import { lookupCommand } from "./commands/lookup.js";
import { safetyCommand } from "./commands/safety.js";
import { statusCommand } from "./commands/status.js";
import { MAIN_GUILD_ID, PROTECTED_GUILD_IDS, SERVERS, extraCommandsFor } from "./config.js";

const mainCommands = [banlistCommand, globalbanCommand, globalunbanCommand, gbaninfoCommand, lookupCommand, safetyCommand, statusCommand];
const serverCommands = [banlistCommand];

const withHelp = <T,>(commands: T[]): (T | typeof helpCommand)[] => (commands.length ? [...commands, helpCommand] : []);

export const commandsFor = (guildId: string) => withHelp(baseCommandsFor(guildId));

const baseCommandsFor = (guildId: string) => {
  const extra = extraCommandsFor(guildId);
  if (PROTECTED_GUILD_IDS.has(guildId)) return mainCommands.filter((command) => extra.includes(command.name) && command.name !== "banlist" && !command.name.startsWith("global"));
  if (guildId === MAIN_GUILD_ID) return mainCommands;
  if (!SERVERS.some((server) => server.id === guildId)) return [];
  return [...serverCommands, ...mainCommands.filter((command) => extra.includes(command.name) && !serverCommands.includes(command))];
};

export const registerGuild = async (rest: REST, applicationId: string, guildId: string): Promise<string> => {
  const commands = commandsFor(guildId);
  await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body: commands.map((command) => command.toJSON()) });
  return commands.length ? commands.map((command) => `/${command.name}`).join(", ") : "none";
};

export const registerAll = async (token: string, applicationId: string, guildIds: Iterable<string>): Promise<void> => {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(applicationId), { body: [] });
  for (const guildId of new Set([MAIN_GUILD_ID, ...SERVERS.map((server) => server.id), ...PROTECTED_GUILD_IDS, ...guildIds])) {
    try {
      console.log(`${guildId}: ${await registerGuild(rest, applicationId, guildId)}`);
    } catch (error) {
      console.log(`${guildId}: skipped (${error instanceof Error ? error.message : "unknown error"})`);
    }
  }
};
