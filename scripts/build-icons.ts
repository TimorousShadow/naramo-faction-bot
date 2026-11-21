// TimorousShadow
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { ICONS, emojiName } from "../src/icon-set.js";

const source = process.env.PAPICONS_DIR;
if (!source) throw new Error("Set PAPICONS_DIR to the Papicons icons folder.");
const out = new URL("../assets/icons/", import.meta.url);
await mkdir(out, { recursive: true });
for (const icon of ICONS) {
  const svg = (await readFile(join(source, `${icon}.svg`), "utf8")).replace(/(fill|stroke)="(black|#000000|#000)"/g, '$1="#ffffff"');
  const png = await sharp(Buffer.from(svg), { density: 600 }).resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await writeFile(new URL(`${emojiName(icon)}.png`, out), png);
}
console.log(`Rendered ${ICONS.length} icons.`);
