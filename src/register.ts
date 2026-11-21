// TimorousShadow
import "dotenv/config";
import { REST, Routes } from "discord.js";
import { banlistCommand } from "./commands/banlist.js";
import { gbaninfoCommand } from "./commands/gbaninfo.js";
import { globalbanCommand } from "./commands/globalban.js";
import { globalunbanCommand } from "./commands/globalunban.js";
import { lookupCommand } from "./commands/lookup.js";
import { safetyCommand } from "./commands/safety.js";
import { statusCommand } from "./commands/status.js";
import { MAIN_GUILD_ID } from "./config.js";

const { DISCORD_TOKEN, DISCORD_APPLICATION_ID } = process.env;
if (!DISCORD_TOKEN || !DISCORD_APPLICATION_ID) throw new Error("DISCORD_TOKEN and DISCORD_APPLICATION_ID are required.");

const everywhere = [banlistCommand];
const mainOnly = [globalbanCommand, globalunbanCommand, gbaninfoCommand, lookupCommand, safetyCommand, statusCommand];

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
await rest.put(Routes.applicationCommands(DISCORD_APPLICATION_ID), { body: everywhere.map((command) => command.toJSON()) });
await rest.put(Routes.applicationGuildCommands(DISCORD_APPLICATION_ID, MAIN_GUILD_ID), { body: mainOnly.map((command) => command.toJSON()) });
console.log(`Registered ${everywhere.map((c) => `/${c.name}`).join(", ")} everywhere and ${mainOnly.map((c) => `/${c.name}`).join(", ")} in the main server.`);
