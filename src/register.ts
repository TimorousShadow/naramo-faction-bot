// TimorousShadow
import "dotenv/config";
import { REST, Routes } from "discord.js";
import { registerAll } from "./registry.js";

const { DISCORD_TOKEN, DISCORD_APPLICATION_ID } = process.env;
if (!DISCORD_TOKEN || !DISCORD_APPLICATION_ID) throw new Error("DISCORD_TOKEN and DISCORD_APPLICATION_ID are required.");

const guilds = (await new REST({ version: "10" }).setToken(DISCORD_TOKEN).get(Routes.userGuilds())) as { id: string }[];
await registerAll(DISCORD_TOKEN, DISCORD_APPLICATION_ID, guilds.map((guild) => guild.id));
