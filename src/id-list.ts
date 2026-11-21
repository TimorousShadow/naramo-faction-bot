// TimorousShadow
export interface IdList {
  ids: string[];
  duplicates: number;
  rounded: string[];
  malformed: string[];
  column: string | null;
}

const DISCORD_EPOCH = 1420070400000n;
const SNOWFLAKE = /^\d{17,20}$/;
const SCIENTIFIC = /^\d+(?:[.,]\d+)?e\+?\d+$/i;
const ID_HEADER = /^(?:discord[ _-]?)?(?:user[ _-]?)?id$/i;

export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === "," || char === ";" || char === "\t") {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
};

export const isSnowflake = (value: string): boolean => {
  if (!SNOWFLAKE.test(value)) return false;
  const created = (BigInt(value) >> 22n) + DISCORD_EPOCH;
  return created > DISCORD_EPOCH && created <= BigInt(Date.now()) + 60_000n;
};

export const readIdList = (text: string): IdList => {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const first = rows[0] ?? [];
  const headerIndex = first.some((value) => SNOWFLAKE.test(value)) ? -1 : first.findIndex((value) => ID_HEADER.test(value));
  const body = headerIndex >= 0 || (first.length > 0 && !first.some((value) => /\d{6,}/.test(value))) ? rows.slice(1) : rows;
  const cells = headerIndex >= 0 ? body.map((row) => row[headerIndex] ?? "") : body.flat();
  const seen = new Set<string>();
  const rounded: string[] = [];
  const malformed: string[] = [];
  let duplicates = 0;
  for (const raw of cells) {
    const value = raw.replace(/^<@!?(\d+)>$/, "$1").replace(/\s+/g, "");
    if (value === "") continue;
    if (isSnowflake(value)) {
      if (seen.has(value)) duplicates++;
      else seen.add(value);
    } else if (SCIENTIFIC.test(value)) rounded.push(raw);
    else if (/^\d{15,22}$/.test(value)) malformed.push(raw);
    else if (headerIndex >= 0) malformed.push(raw);
  }
  return { ids: [...seen], duplicates, rounded, malformed, column: headerIndex >= 0 ? (first[headerIndex] ?? null) : null };
};
