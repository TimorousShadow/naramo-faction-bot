// TimorousShadow
import "dotenv/config";
import { REST, Routes } from "discord.js";
import { banlistCommand } from "./commands/banlist.js";

const { DISCORD_TOKEN, DISCORD_APPLICATION_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !DISCORD_APPLICATION_ID || !GUILD_ID) throw new Error("DISCORD_TOKEN, DISCORD_APPLICATION_ID and GUILD_ID are required.");

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
const commands = [banlistCommand.toJSON()];
await rest.put(Routes.applicationGuildCommands(DISCORD_APPLICATION_ID, GUILD_ID), { body: commands });
console.log(`Registered ${commands.length} command(s) in ${GUILD_ID}.`);
