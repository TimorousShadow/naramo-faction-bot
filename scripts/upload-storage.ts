// TimorousShadow
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { REST, Routes } from "discord.js";
import { COLORED, LOGOS, coloredEmojiName, logoEmojiName } from "../src/icon-set.js";

const { DISCORD_TOKEN, STORAGE_GUILD_ID, LOGO_DIR } = process.env;
if (!DISCORD_TOKEN || !STORAGE_GUILD_ID) throw new Error("DISCORD_TOKEN and STORAGE_GUILD_ID are required.");
const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
const file = new URL("../src/emojis.json", import.meta.url);
const ids = JSON.parse(await readFile(file, "utf8")) as Record<string, string>;
const existing = (await rest.get(Routes.guildEmojis(STORAGE_GUILD_ID))) as { id: string; name: string }[];
for (const emoji of existing) ids[emoji.name] = emoji.id;

const uploads: [string, () => Promise<Buffer>][] = [
  ...COLORED.map(([icon, color]): [string, () => Promise<Buffer>] => [coloredEmojiName(icon, color), () => readFile(new URL(`../assets/icons/colored/${coloredEmojiName(icon, color)}.png`, import.meta.url))]),
  ...(LOGO_DIR ? LOGOS.map((logo): [string, () => Promise<Buffer>] => [logoEmojiName(logo), () => readFile(join(LOGO_DIR, `${logo}.png`))]) : []),
];
for (const [name, load] of uploads) {
  if (existing.some((emoji) => emoji.name === name)) continue;
  const emoji = (await rest.post(Routes.guildEmojis(STORAGE_GUILD_ID), { body: { name, image: `data:image/png;base64,${(await load()).toString("base64")}` } })) as { id: string };
  ids[name] = emoji.id;
  console.log(`Uploaded ${name}`);
}
await writeFile(file, `${JSON.stringify(ids, null, 2)}\n`);
console.log("Storage emojis saved to src/emojis.json.");
