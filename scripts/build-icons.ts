// TimorousShadow
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { COLORED, COLORS, ICONS, coloredEmojiName, emojiName } from "../src/icon-set.js";

const source = process.env.PAPICONS_DIR;
if (!source) throw new Error("Set PAPICONS_DIR to the Papicons icons folder.");
const out = new URL("../assets/icons/", import.meta.url);
const colored = new URL("../assets/icons/colored/", import.meta.url);
await mkdir(colored, { recursive: true });

const render = async (icon: string, color: string): Promise<Buffer> => {
  const svg = (await readFile(join(source, `${icon}.svg`), "utf8")).replace(/(fill|stroke)="(black|#000000|#000)"/g, `$1="${color}"`);
  return sharp(Buffer.from(svg), { density: 600 }).resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
};

for (const icon of ICONS) await writeFile(new URL(`${emojiName(icon)}.png`, out), await render(icon, "#ffffff"));
for (const [icon, color] of COLORED) await writeFile(new URL(`${coloredEmojiName(icon, color)}.png`, colored), await render(icon, COLORS[color]));
console.log(`Rendered ${ICONS.length} white icons and ${COLORED.length} coloured icons.`);
