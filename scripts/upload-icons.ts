// TimorousShadow
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { REST, Routes } from "discord.js";
import { ICONS, emojiName } from "../src/icon-set.js";

const { DISCORD_TOKEN, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !GUILD_ID) throw new Error("DISCORD_TOKEN and GUILD_ID are required.");
const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
const existing = (await rest.get(Routes.guildEmojis(GUILD_ID))) as { id: string; name: string }[];
const ids: Record<string, string> = Object.fromEntries(existing.filter((e) => e.name.startsWith("nf_")).map((e) => [e.name, e.id]));
for (const icon of ICONS) {
  const name = emojiName(icon);
  if (ids[name]) continue;
  const file = await readFile(new URL(`../assets/icons/${name}.png`, import.meta.url));
  const emoji = (await rest.post(Routes.guildEmojis(GUILD_ID), { body: { name, image: `data:image/png;base64,${file.toString("base64")}` } })) as { id: string };
  ids[name] = emoji.id;
  console.log(`Uploaded ${name}`);
}
await writeFile(new URL("../src/emojis.json", import.meta.url), `${JSON.stringify(ids, null, 2)}\n`);
console.log(`${Object.keys(ids).length} icons available.`);
