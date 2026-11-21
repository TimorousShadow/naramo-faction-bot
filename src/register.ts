// TimorousShadow
import "dotenv/config";
import { REST, Routes } from "discord.js";
import { banlistCommand } from "./commands/banlist.js";
import { globalbanCommand } from "./commands/globalban.js";
import { MAIN_GUILD_ID } from "./config.js";

const { DISCORD_TOKEN, DISCORD_APPLICATION_ID } = process.env;
if (!DISCORD_TOKEN || !DISCORD_APPLICATION_ID) throw new Error("DISCORD_TOKEN and DISCORD_APPLICATION_ID are required.");

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
await rest.put(Routes.applicationCommands(DISCORD_APPLICATION_ID), { body: [banlistCommand.toJSON()] });
await rest.put(Routes.applicationGuildCommands(DISCORD_APPLICATION_ID, MAIN_GUILD_ID), { body: [globalbanCommand.toJSON()] });
console.log("Registered /banlist in every server and /globalban in the main server.");
