// TimorousShadow
import { readFileSync } from "node:fs";
import opentype from "opentype.js";

export type Weight = 400 | 500 | 600 | 700;

const FILES: Record<Weight, string> = { 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold" };
const fonts = Object.fromEntries(
  (Object.keys(FILES) as unknown as Weight[]).map((weight) => {
    const buffer = readFileSync(new URL(`../../assets/fonts/SNPro-${FILES[weight]}.ttf`, import.meta.url));
    return [weight, opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))];
  }),
) as Record<Weight, opentype.Font>;

const TRACKING = -0.015;

export interface TextStyle {
  size: number;
  weight?: Weight;
  fill: string;
  opacity?: number;
  anchor?: "start" | "middle" | "end";
  tracking?: number;
}

const options = (style: TextStyle) => ({ kerning: true, letterSpacing: style.tracking ?? TRACKING });

export const measure = (content: string, style: Pick<TextStyle, "size" | "weight" | "tracking">): number =>
  fonts[style.weight ?? 400].getAdvanceWidth(content, style.size, { kerning: true, letterSpacing: style.tracking ?? TRACKING } as opentype.RenderOptions);

const capHeight = (weight: Weight, size: number): number => {
  const font = fonts[weight];
  const os2 = font.tables.os2 as { sCapHeight?: number } | undefined;
  return ((os2?.sCapHeight || font.unitsPerEm * 0.7) / font.unitsPerEm) * size;
};

export const text = (content: string, x: number, baseline: number, style: TextStyle): string => {
  if (!content) return "";
  const width = measure(content, style);
  const left = style.anchor === "middle" ? x - width / 2 : style.anchor === "end" ? x - width : x;
  const path = fonts[style.weight ?? 400].getPath(content, left, baseline, style.size, options(style) as opentype.RenderOptions).toPathData(2);
  return `<path d="${path}" fill="${style.fill}"${style.opacity !== undefined ? ` fill-opacity="${style.opacity}"` : ""}/>`;
};

export const centered = (content: string, x: number, middle: number, style: TextStyle): string =>
  text(content, x, middle + capHeight(style.weight ?? 400, style.size) / 2, style);

const icons = new Map<string, string>();

export const papicon = (name: string, x: number, y: number, size: number, fill: string, opacity = 1): string => {
  let inner = icons.get(name);
  if (inner === undefined) {
    const raw = readFileSync(new URL(`../../assets/papicons/${name}.svg`, import.meta.url), "utf8");
    inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/fill="(black|#000000|#000)"/g, 'fill="@@"');
    icons.set(name, inner);
  }
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(size / 24).toFixed(4)})" fill-opacity="${opacity}">${inner.replaceAll("@@", fill)}</g>`;
};
