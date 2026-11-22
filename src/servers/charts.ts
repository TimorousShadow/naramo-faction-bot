// TimorousShadow
import sharp from "sharp";
import type { FleetPoint, ServerPoint, ServerRow } from "./history.js";

const FONT = "Inter, 'Segoe UI', Arial, sans-serif";
const C = {
  bg: "#111216",
  panel: "#181a20",
  line: "#ffffff",
  text: "#f2f3f5",
  muted: "#9da3ae",
  faint: "#6b7280",
  players: "#8b9bff",
  ghost: "#9da3ae",
  good: "#4fd18b",
  warn: "#f0b232",
  bad: "#f2545b",
  ping: "#5bc0eb",
};
const REGION_COLORS = ["#8b9bff", "#4fd18b", "#f0b232", "#5bc0eb", "#f2545b", "#c084fc", "#f78fb3", "#9da3ae"];

type Pt = [number, number];

const esc = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
export const compact = (value: number): string =>
  value >= 1e6 ? `${(value / 1e6).toFixed(value >= 1e7 ? 1 : 2)}M` : value >= 10_000 ? `${(value / 1e3).toFixed(1)}k` : Math.round(value).toLocaleString("en-US");

const text = (x: number, y: number, content: string, size: number, fill: string, options: { weight?: number; anchor?: "start" | "middle" | "end"; opacity?: number; spacing?: number } = {}): string =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${FONT}" font-size="${size}" font-weight="${options.weight ?? 400}" fill="${fill}"${options.anchor ? ` text-anchor="${options.anchor}"` : ""}${options.opacity !== undefined ? ` fill-opacity="${options.opacity}"` : ""}${options.spacing ? ` letter-spacing="${options.spacing}"` : ""}>${esc(content)}</text>`;

const textWidth = (content: string, size: number): number => content.length * size * 0.56;

const pill = (x: number, y: number, content: string, size: number, fill: string, color: string, anchor: "start" | "end" = "start"): string => {
  const width = textWidth(content, size) + size * 1.3;
  const left = anchor === "end" ? x - width : x;
  return `<rect x="${left.toFixed(1)}" y="${(y - size * 1.05).toFixed(1)}" width="${width.toFixed(1)}" height="${(size * 1.6).toFixed(1)}" rx="${(size * 0.8).toFixed(1)}" fill="${fill}"/>${text(left + width / 2, y, content, size, color, { weight: 600, anchor: "middle" })}`;
};

const frame = (width: number, height: number, body: string, defs = ""): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs><rect width="${width}" height="${height}" rx="28" fill="${C.bg}"/>${body}</svg>`;

const monotone = (points: readonly Pt[]): string => {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0]![0]},${points[0]![1]}`;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) slopes.push((points[i + 1]![1] - points[i]![1]) / (points[i + 1]![0] - points[i]![0] || 1));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0]!;
    if (i === n - 1) return slopes[n - 2]!;
    const s0 = slopes[i - 1]!;
    const s1 = slopes[i]!;
    if (s0 * s1 <= 0) return 0;
    const h0 = points[i]![0] - points[i - 1]![0];
    const h1 = points[i + 1]![0] - points[i]![0];
    const p = (s0 * h1 + s1 * h0) / (h0 + h1 || 1);
    return Math.sign(s0) * Math.min(Math.abs(s0), Math.abs(s1), Math.abs(p) / 2) * 2;
  });
  let d = `M${points[0]![0].toFixed(1)},${points[0]![1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const dx = (x1 - x0) / 3;
    d += `C${(x0 + dx).toFixed(1)},${(y0 + dx * tangents[i]!).toFixed(1)} ${(x1 - dx).toFixed(1)},${(y1 - dx * tangents[i + 1]!).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
};

const segments = <T extends { at: number }>(points: readonly T[], maxGap: number): T[][] => {
  const out: T[][] = [];
  let current: T[] = [];
  for (const point of points) {
    const last = current.at(-1);
    if (last && point.at - last.at > maxGap) {
      out.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) out.push(current);
  return out;
};

const niceMax = (value: number, floor: number): number => {
  const raw = Math.max(value, floor) * 1.12;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= raw / 4)! * magnitude;
  return Math.ceil(raw / step) * step;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const hhmm = (at: number): string => new Date(at).toISOString().slice(11, 16);

const timeTicks = (from: number, to: number): { at: number; label: string }[] => {
  const span = to - from;
  const hour = 3_600_000;
  const step = span <= 6 * hour ? hour : span <= 26 * hour ? 4 * hour : span <= 8 * 24 * hour ? 24 * hour : 5 * 24 * hour;
  const ticks: { at: number; label: string }[] = [];
  for (let at = Math.ceil(from / step) * step; at <= to; at += step) {
    const date = new Date(at);
    const label = step < 24 * hour ? hhmm(at) : step === 24 * hour ? `${DAYS[date.getUTCDay()]} ${date.getUTCDate()}` : `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
    ticks.push({ at, label });
  }
  return ticks;
};

interface Plot {
  x: (at: number) => number;
  y: (value: number) => number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  max: number;
}

const plot = (left: number, right: number, top: number, bottom: number, from: number, to: number, max: number): Plot => ({
  left, right, top, bottom, max,
  x: (at) => left + ((at - from) / (to - from || 1)) * (right - left),
  y: (value) => bottom - (Math.max(0, value) / (max || 1)) * (bottom - top),
});

const grid = (area: Plot, from: number, to: number, format: (value: number) => string, xLabels = true): string => {
  let out = "";
  for (let i = 0; i <= 4; i += 1) {
    const value = (area.max / 4) * i;
    const y = area.y(value);
    out += `<line x1="${area.left}" x2="${area.right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${C.line}" stroke-opacity="${i === 0 ? 0.22 : 0.07}"/>`;
    out += text(area.left - 16, y + 7, format(value), 20, C.muted, { anchor: "end" });
  }
  if (xLabels) for (const tick of timeTicks(from, to)) {
    const x = area.x(tick.at);
    if (x < area.left + 30 || x > area.right - 30) continue;
    out += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${area.top}" y2="${area.bottom}" stroke="${C.line}" stroke-opacity="0.05"/>`;
    out += text(x, area.bottom + 34, tick.label, 20, C.muted, { anchor: "middle" });
  }
  return out;
};

const areaPath = (points: readonly Pt[], baseline: number): string => {
  const line = monotone(points);
  if (!line) return "";
  return `${line}L${points.at(-1)![0].toFixed(1)},${baseline}L${points[0]![0].toFixed(1)},${baseline}Z`;
};

export interface PlayersChart {
  points: FleetPoint[];
  ghost: FleetPoint[];
  ghostShift: number;
  from: number;
  to: number;
  bucket: number;
  rangeLabel: string;
  ghostLabel: string | null;
  current: number;
  change: number | null;
}

export const playersChart = (input: PlayersChart): string => {
  const width = 1400;
  const height = 660;
  const values = [...input.points.map((point) => point.peak), ...input.ghost.map((point) => point.players)];
  const area = plot(96, width - 56, 200, height - 92, input.from, input.to, niceMax(Math.max(0, ...values), 50));
  const gap = input.bucket * 3.5;
  let body = text(56, 72, "PLAYERS", 20, C.muted, { weight: 600, spacing: 2 });
  body += text(56, 140, input.current.toLocaleString("en-US"), 64, C.text, { weight: 700 });
  if (input.change !== null) {
    const up = input.change >= 0;
    const label = `${up ? "▲" : "▼"} ${Math.abs(input.change).toFixed(1)}%${input.ghostLabel ? ` vs ${input.ghostLabel.toLowerCase()}` : ""}`;
    body += pill(56 + textWidth(input.current.toLocaleString("en-US"), 64) + 28, 128, label, 22, up ? "#4fd18b26" : "#f2545b26", up ? C.good : C.bad);
  }
  body += `<line x1="${width - 520}" x2="${width - 488}" y1="64" y2="64" stroke="${C.players}" stroke-width="5" stroke-linecap="round"/>`;
  body += text(width - 476, 71, input.rangeLabel, 20, C.text);
  if (input.ghostLabel && input.ghost.length) {
    body += `<line x1="${width - 260}" x2="${width - 228}" y1="64" y2="64" stroke="${C.ghost}" stroke-width="3" stroke-dasharray="6 6" stroke-opacity="0.8"/>`;
    body += text(width - 216, 71, input.ghostLabel, 20, C.muted);
  }
  body += grid(area, input.from, input.to, compact);
  for (const part of segments(input.ghost, gap)) {
    const pts = part.map((point): Pt => [area.x(point.at + input.ghostShift), area.y(point.players)]);
    body += `<path d="${monotone(pts)}" fill="none" stroke="${C.ghost}" stroke-width="3" stroke-dasharray="7 8" stroke-opacity="0.55" stroke-linecap="round"/>`;
  }
  for (const part of segments(input.points, gap)) {
    const pts = part.map((point): Pt => [area.x(point.at), area.y(point.players)]);
    body += `<path d="${areaPath(pts, area.bottom)}" fill="url(#playersFill)"/>`;
    body += `<path d="${monotone(pts)}" fill="none" stroke="${C.players}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  const peak = input.points.reduce<FleetPoint | null>((best, point) => (!best || point.peak > best.peak ? point : best), null);
  if (peak) {
    const x = area.x(peak.at);
    const y = area.y(peak.peak);
    body += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y.toFixed(1)}" y2="${area.bottom}" stroke="${C.players}" stroke-opacity="0.35" stroke-dasharray="3 6" stroke-width="2"/>`;
    body += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${C.bg}" stroke="${C.players}" stroke-width="4"/>`;
    const multiDay = input.to - input.from > 26 * 3_600_000;
    const label = `Peak ${peak.peak.toLocaleString("en-US")} · ${multiDay ? `${DAYS[new Date(peak.at).getUTCDay()]} ` : ""}${hhmm(peak.at)}`;
    const anchor = x > width - 320 ? "end" : "start";
    body += pill(anchor === "end" ? x - 14 : x + 14, Math.max(area.top + 10, y - 18), label, 20, "#8b9bff2e", C.text, anchor);
  }
  const last = input.points.at(-1);
  if (last) {
    const x = area.x(last.at);
    const y = area.y(last.players);
    body += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="18" fill="${C.players}" fill-opacity="0.18"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${C.players}"/>`;
  }
  if (!input.points.length) body += text(width / 2, (area.top + area.bottom) / 2, "Collecting data, check back in a few minutes", 26, C.muted, { anchor: "middle" });
  body += text(width - 56, height - 22, "UTC", 18, C.faint, { anchor: "end" });
  const defs = `<linearGradient id="playersFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${C.players}" stop-opacity="0.42"/><stop offset="1" stop-color="${C.players}" stop-opacity="0"/></linearGradient>`;
  return frame(width, height, body, defs);
};

export const fpsColor = (fps: number): string => (fps >= 50 ? C.good : fps >= 35 ? C.warn : C.bad);

const place = (server: ServerRow): string => {
  const name = server.city ?? server.country ?? "Unknown";
  return name.length > 15 ? `${name.slice(0, 14).trimEnd()}…` : name;
};

export const fleetBoard = (servers: readonly ServerRow[]): string => {
  const width = 1400;
  const shown = servers.slice(0, 20);
  const rowHeight = 50;
  const height = Math.max(700, 150 + shown.length * rowHeight + (servers.length > shown.length ? 50 : 0));
  let body = text(56, 72, "SERVERS", 20, C.muted, { weight: 600, spacing: 2 });
  body += text(56, 104, "Fill and FPS, busiest first", 20, C.faint);
  const barLeft = 300;
  const barRight = 720;
  shown.forEach((server, index) => {
    const y = 150 + index * rowHeight;
    const fill = server.maxPlayers ? Math.min(1, server.playing / server.maxPlayers) : 0;
    body += text(56, y + 8, server.countryCode ?? "··", 18, C.faint, { weight: 600, spacing: 1 });
    body += text(102, y + 8, place(server), 22, C.text, { weight: 500 });
    body += `<rect x="${barLeft}" y="${y - 10}" width="${barRight - barLeft}" height="20" rx="10" fill="${C.line}" fill-opacity="0.07"/>`;
    if (fill > 0) body += `<rect x="${barLeft}" y="${y - 10}" width="${Math.max(20, (barRight - barLeft) * fill).toFixed(1)}" height="20" rx="10" fill="${fpsColor(server.fps)}"/>`;
    body += text(barRight + 20, y + 8, `${server.playing}/${server.maxPlayers}`, 22, C.text, { weight: 600 });
    body += text(barRight + 120, y + 8, `${server.fps.toFixed(0)} fps`, 20, fpsColor(server.fps));
  });
  if (servers.length > shown.length) body += text(56, 150 + shown.length * rowHeight + 8, `and ${servers.length - shown.length} more servers`, 20, C.muted);
  if (!servers.length) body += text(56, 170, "No public servers right now", 24, C.muted);

  const players = servers.reduce((sum, server) => sum + server.playing, 0);
  const capacity = servers.reduce((sum, server) => sum + server.maxPlayers, 0);
  const ratio = capacity ? players / capacity : 0;
  const cx = 1090;
  const cy = 230;
  const r = 110;
  const circumference = 2 * Math.PI * r;
  body += `<line x1="880" x2="880" y1="56" y2="${height - 56}" stroke="${C.line}" stroke-opacity="0.07"/>`;
  body += text(940, 72, "CAPACITY", 20, C.muted, { weight: 600, spacing: 2 });
  body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.line}" stroke-opacity="0.07" stroke-width="26"/>`;
  body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.players}" stroke-width="26" stroke-linecap="round" stroke-dasharray="${(circumference * ratio).toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`;
  body += text(cx, cy + 6, `${Math.round(ratio * 100)}%`, 52, C.text, { weight: 700, anchor: "middle" });
  body += text(cx, cy + 42, `${players.toLocaleString("en-US")} of ${capacity.toLocaleString("en-US")}`, 20, C.muted, { anchor: "middle" });

  const regions = new Map<string, { players: number; servers: number }>();
  for (const server of servers) {
    const key = server.country ?? "Unknown";
    const entry = regions.get(key) ?? { players: 0, servers: 0 };
    entry.players += server.playing;
    entry.servers += 1;
    regions.set(key, entry);
  }
  const sorted = [...regions.entries()].sort((a, b) => b[1].players - a[1].players);
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6).reduce((sum, [, entry]) => ({ players: sum.players + entry.players, servers: sum.servers + entry.servers }), { players: 0, servers: 0 });
  if (rest.servers) top.push(["Other", rest]);
  body += text(940, 420, "REGIONS", 20, C.muted, { weight: 600, spacing: 2 });
  let x = 940;
  const barWidth = 400;
  top.forEach(([, entry], index) => {
    const w = players ? (entry.players / players) * barWidth : barWidth / top.length;
    body += `<rect x="${x.toFixed(1)}" y="446" width="${Math.max(2, w - 4).toFixed(1)}" height="18" rx="6" fill="${REGION_COLORS[index % REGION_COLORS.length]}"/>`;
    x += w;
  });
  top.forEach(([name, entry], index) => {
    const y = 506 + index * 40;
    body += `<circle cx="948" cy="${y - 7}" r="8" fill="${REGION_COLORS[index % REGION_COLORS.length]}"/>`;
    body += text(968, y, name.slice(0, 18), 21, C.text);
    body += text(1340, y, `${entry.players} · ${entry.servers} srv`, 20, C.muted, { anchor: "end" });
  });
  return frame(width, height, body);
};

export const serverChart = (server: ServerRow, series: readonly ServerPoint[]): string => {
  const width = 1400;
  const height = 900;
  const from = series[0]?.at ?? Date.now() - 3_600_000;
  const to = Math.max(series.at(-1)?.at ?? Date.now(), from + 600_000);
  const panels = [
    { label: "PLAYERS", color: C.players, value: (point: ServerPoint) => point.playing, max: Math.ceil((Math.max(server.maxPlayers, 10) + 1) / 20) * 20, format: (v: number) => String(Math.round(v)), fill: true, limit: server.maxPlayers },
    { label: "SERVER FPS", color: C.good, value: (point: ServerPoint) => point.fps, max: 60, format: (v: number) => String(Math.round(v)), fill: false, limit: null },
    { label: "PING (MS)", color: C.ping, value: (point: ServerPoint) => point.ping, max: niceMax(Math.max(0, ...series.map((point) => point.ping)), 100), format: (v: number) => String(Math.round(v)), fill: false, limit: null },
  ];
  const panelHeight = 190;
  let body = "";
  let defs = "";
  panels.forEach((panel, index) => {
    const top = 70 + index * (panelHeight + 82);
    const area = plot(96, width - 56, top + 30, top + 30 + panelHeight, from, to, panel.max);
    const latest = series.at(-1);
    body += text(56, top, panel.label, 20, C.muted, { weight: 600, spacing: 2 });
    if (latest) body += text(width - 56, top, panel.format(panel.value(latest)), 26, panel.color, { weight: 700, anchor: "end" });
    body += grid(area, from, to, panel.format, index === panels.length - 1);
    if (panel.limit) body += `<line x1="${area.left}" x2="${area.right}" y1="${area.y(panel.limit).toFixed(1)}" y2="${area.y(panel.limit).toFixed(1)}" stroke="${C.bad}" stroke-opacity="0.5" stroke-dasharray="6 8" stroke-width="2"/>`;
    defs += `<linearGradient id="fill${index}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${panel.color}" stop-opacity="0.35"/><stop offset="1" stop-color="${panel.color}" stop-opacity="0"/></linearGradient>`;
    for (const part of segments(series, 10 * 60_000)) {
      const pts = part.map((point): Pt => [area.x(point.at), area.y(Math.min(panel.max, panel.value(point)))]);
      body += `<path d="${areaPath(pts, area.bottom)}" fill="url(#fill${index})"/>`;
      body += `<path d="${monotone(pts)}" fill="none" stroke="${panel.color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
  });
  if (series.length < 2) body += text(width / 2, height / 2, "Not enough samples yet for this server", 26, C.muted, { anchor: "middle" });
  body += text(width - 56, height - 18, "UTC", 18, C.faint, { anchor: "end" });
  return frame(width, height, body, defs);
};

export const heatmap = (hours: readonly { at: number; players: number }[]): { svg: string; busiest: { day: number; hour: number; players: number } | null; quietest: { day: number; hour: number; players: number } | null } => {
  const sums = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ total: 0, count: 0 })));
  for (const entry of hours) {
    const date = new Date(entry.at);
    const day = (date.getUTCDay() + 6) % 7;
    const cell = sums[day]![date.getUTCHours()]!;
    cell.total += entry.players;
    cell.count += 1;
  }
  const values = sums.map((row) => row.map((cell) => (cell.count ? cell.total / cell.count : null)));
  const filled = values.flatMap((row, day) => row.map((value, hour) => ({ day, hour, players: value }))).filter((cell): cell is { day: number; hour: number; players: number } => cell.players !== null);
  const max = Math.max(1, ...filled.map((cell) => cell.players));
  const min = Math.min(max, ...filled.map((cell) => cell.players));
  const width = 1400;
  const height = 640;
  const left = 130;
  const top = 120;
  const cell = (width - left - 56) / 24;
  const rowHeight = 56;
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let body = text(56, 72, "AVERAGE PLAYERS BY DAY AND HOUR", 20, C.muted, { weight: 600, spacing: 2 });
  values.forEach((row, day) => {
    const y = top + day * rowHeight;
    body += text(56, y + rowHeight / 2 + 4, labels[day]!, 22, C.text, { weight: 500 });
    row.forEach((value, hour) => {
      const x = left + hour * cell;
      if (value === null) {
        body += `<rect x="${(x + 3).toFixed(1)}" y="${y + 3}" width="${(cell - 6).toFixed(1)}" height="${rowHeight - 6}" rx="8" fill="none" stroke="${C.line}" stroke-opacity="0.08" stroke-width="2"/>`;
        return;
      }
      const t = max === min ? 1 : (value - min) / (max - min);
      body += `<rect x="${(x + 3).toFixed(1)}" y="${y + 3}" width="${(cell - 6).toFixed(1)}" height="${rowHeight - 6}" rx="8" fill="${C.players}" fill-opacity="${(0.08 + t * 0.92).toFixed(2)}"/>`;
    });
  });
  for (let hour = 0; hour < 24; hour += 3) body += text(left + hour * cell + cell / 2, top + 7 * rowHeight + 34, `${String(hour).padStart(2, "0")}:00`, 19, C.muted, { anchor: "middle" });
  const legendX = width - 56 - 300;
  body += text(legendX - 14, 76, compact(min), 18, C.muted, { anchor: "end" });
  for (let i = 0; i < 10; i += 1) body += `<rect x="${legendX + i * 30}" y="58" width="26" height="22" rx="6" fill="${C.players}" fill-opacity="${(0.08 + (i / 9) * 0.92).toFixed(2)}"/>`;
  body += text(legendX + 314, 76, compact(max), 18, C.muted);
  if (!filled.length) body += text(width / 2, height / 2, "Collecting data, the map fills in over the first week", 26, C.muted, { anchor: "middle" });
  body += text(width - 56, height - 22, "UTC", 18, C.faint, { anchor: "end" });
  const best = filled.reduce<(typeof filled)[number] | null>((a, b) => (!a || b.players > a.players ? b : a), null);
  const worst = filled.reduce<(typeof filled)[number] | null>((a, b) => (!a || b.players < a.players ? b : a), null);
  return { svg: frame(width, height, body), busiest: best, quietest: worst };
};

export const png = async (svg: string): Promise<Buffer> => sharp(Buffer.from(svg), { density: 96 }).png({ compressionLevel: 9 }).toBuffer();
