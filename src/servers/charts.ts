// TimorousShadow
import sharp from "sharp";
import type { FleetPoint, ServerPoint, ServerRow } from "./history.js";
import { centered, measure, papicon, text, type TextStyle, type Weight } from "./type.js";

const T = {
  canvas: "#0b0b0c",
  tile: "#161617",
  fg: "#fafafa",
  ink: "#141414",
  good: "#5fd99a",
  warn: "#f5c451",
  bad: "#f87171",
};
const W = 1400;
const P = 64;
const GAP = 24;
const REGION_SHADES = [1, 0.72, 0.5, 0.34, 0.22, 0.14, 0.09];

type Pt = [number, number];

export const compact = (value: number): string =>
  value >= 1e6 ? `${(value / 1e6).toFixed(value >= 1e7 ? 1 : 2)}M` : value >= 10_000 ? `${(value / 1e3).toFixed(1)}k` : Math.round(value).toLocaleString("en-US");

export const fpsColor = (fps: number): string => (fps >= 50 ? T.good : fps >= 35 ? T.warn : T.bad);

const HOUR = 3_600_000;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const hhmm = (at: number): string => new Date(at).toISOString().slice(11, 16);
const duration = (ms: number): string => {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

const fit = (content: string, style: Pick<TextStyle, "size" | "weight">, max: number): string => {
  if (measure(content, style) <= max) return content;
  let cut = content;
  while (cut.length > 1 && measure(`${cut}…`, style) > max) cut = cut.slice(0, -1).trimEnd();
  return `${cut}…`;
};

const rect = (x: number, y: number, w: number, h: number, r: number, fill: string, opacity = 1): string =>
  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(r, h / 2, Math.max(0, w) / 2).toFixed(1)}" fill="${fill}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ""}/>`;

const tile = (x: number, y: number, w: number, h: number, r = 28): string =>
  `${rect(x, y, w, h, r, T.tile)}<rect x="${x + 0.75}" y="${y + 0.75}" width="${w - 1.5}" height="${h - 1.5}" rx="${r - 0.75}" fill="none" stroke="${T.fg}" stroke-opacity="0.07" stroke-width="1.5"/>`;

const pill = (x: number, middle: number, content: string, options: { size: number; weight?: Weight; height: number; pad: number; fill: string; color: string; opacity?: number; anchor?: "start" | "middle" | "end" }): { svg: string; width: number } => {
  const width = measure(content, { size: options.size, weight: options.weight ?? 600 }) + options.pad * 2;
  const left = options.anchor === "end" ? x - width : options.anchor === "middle" ? x - width / 2 : x;
  const svg =
    rect(left, middle - options.height / 2, width, options.height, options.height / 2, options.fill, options.opacity ?? 1) +
    centered(content, left + width / 2, middle, { size: options.size, weight: options.weight ?? 600, fill: options.color, anchor: "middle" });
  return { svg, width };
};

const heading = (x: number, middle: number, icon: string, label: string, size = 30): string =>
  papicon(icon, x, middle - size / 2, size, T.fg, 0.7) + centered(label, x + size + 12, middle, { size, weight: 500, fill: T.fg, opacity: 0.7 });

const frame = (height: number, body: string, defs = ""): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}"><defs><linearGradient id="badge" x1="0" x2="1" y1="0" y2="0.04"><stop offset="0.5" stop-color="#fafafa"/><stop offset="1" stop-color="#cfcfcf"/></linearGradient>${defs}</defs>${body}</svg>`;

const card = (height: number): string => tile(0, 0, W, height, 40);

const smooth = (points: readonly Pt[]): string => {
  const n = points.length;
  if (!n) return "";
  if (n === 1) return `M${points[0]![0].toFixed(1)},${points[0]![1].toFixed(1)}`;
  const slopes = points.slice(0, -1).map((point, i) => (points[i + 1]![1] - point[1]) / (points[i + 1]![0] - point[0] || 1));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0]!;
    if (i === n - 1) return slopes[n - 2]!;
    const s0 = slopes[i - 1]!;
    const s1 = slopes[i]!;
    if (s0 * s1 <= 0) return 0;
    const h0 = points[i]![0] - points[i - 1]![0];
    const h1 = points[i + 1]![0] - points[i]![0];
    return Math.sign(s0) * Math.min(Math.abs(s0), Math.abs(s1), Math.abs((s0 * h1 + s1 * h0) / (h0 + h1 || 1)) / 2) * 2;
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

const segments = <P extends { at: number }>(points: readonly P[], maxGap: number): P[][] => {
  const out: P[][] = [];
  let current: P[] = [];
  for (const point of points) {
    if (current.length && point.at - current.at(-1)!.at > maxGap) {
      out.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) out.push(current);
  return out;
};

const niceMax = (value: number, floor: number): number => {
  const raw = Math.max(value, floor) * 1.1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude * 2 >= raw) ?? 10) * magnitude;
  return Math.ceil(raw / (step / 2)) * (step / 2);
};

const timeTicks = (from: number, to: number): { at: number; label: string }[] => {
  const span = to - from;
  const step = span <= 7 * HOUR ? HOUR : span <= 26 * HOUR ? 4 * HOUR : span <= 8 * 24 * HOUR ? 24 * HOUR : 5 * 24 * HOUR;
  const ticks: { at: number; label: string }[] = [];
  for (let at = Math.ceil(from / step) * step; at <= to; at += step) {
    const date = new Date(at);
    ticks.push({ at, label: step < 24 * HOUR ? hhmm(at) : step === 24 * HOUR ? `${DAYS[date.getUTCDay()]} ${date.getUTCDate()}` : `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}` });
  }
  return ticks;
};

interface Line {
  points: readonly Pt[];
  baseline: number;
  color: string;
  width: number;
  fillId?: string;
}

const lineSvg = (line: Line): string => {
  if (!line.points.length) return "";
  const d = smooth(line.points);
  const area = line.fillId ? `<path d="${d}L${line.points.at(-1)![0].toFixed(1)},${line.baseline}L${line.points[0]![0].toFixed(1)},${line.baseline}Z" fill="url(#${line.fillId})"/>` : "";
  return `${area}<path d="${d}" fill="none" stroke="${line.color}" stroke-width="${line.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
};

const endDot = ([x, y]: Pt, color: string): string =>
  `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="30" fill="${color}" fill-opacity="0.06"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="18" fill="${color}" fill-opacity="0.16"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="${color}"/>`;

const fade = (id: string, color: string, top = 0.16): string =>
  `<linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="${top}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient>`;

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
  capacity: number;
  change: number | null;
}

export const playersChart = (input: PlayersChart): string => {
  const height = 780;
  const left = P;
  const right = W - P;
  const top = 400;
  const bottom = 668;
  const max = niceMax(Math.max(0, ...input.points.map((point) => point.peak), ...input.ghost.map((point) => point.players)), 50);
  const x = (at: number) => left + ((at - input.from) / (input.to - input.from || 1)) * (right - left);
  const y = (value: number) => bottom - (Math.max(0, value) / max) * (bottom - top);
  const gap = input.bucket * 3.5;
  let body = card(height) + heading(P, 100, "user", "Players");

  const legend: { label: string; dashed: boolean }[] = [{ label: input.rangeLabel, dashed: false }, ...(input.ghostLabel && input.ghost.length ? [{ label: input.ghostLabel, dashed: true }] : [])];
  let cursor = right;
  for (const item of [...legend].reverse()) {
    const width = measure(item.label, { size: 30, weight: 500 });
    body += centered(item.label, cursor, 100, { size: 30, weight: 500, fill: T.fg, opacity: item.dashed ? 0.45 : 0.75, anchor: "end" });
    cursor -= width + 14;
    body += `<line x1="${cursor - 36}" x2="${cursor}" y1="100" y2="100" stroke="${T.fg}" stroke-width="${item.dashed ? 4 : 6}" stroke-linecap="round"${item.dashed ? ' stroke-dasharray="0.1 10" stroke-opacity="0.5"' : ""}/>`;
    cursor -= 36 + 36;
  }

  const big = input.current.toLocaleString("en-US");
  const bigStyle = { size: 132, weight: 700 as Weight, fill: T.fg };
  body += text(big, P - 4, 262, bigStyle);
  if (input.capacity) body += text(`/${input.capacity.toLocaleString("en-US")}`, P + measure(big, bigStyle) + 10, 262, { size: 46, weight: 500, fill: T.fg, opacity: 0.4 });
  if (input.change !== null) {
    const label = `${input.change >= 0 ? "+" : "−"}${Math.abs(input.change).toFixed(1)}%${input.ghostLabel ? ` vs ${input.ghostLabel.toLowerCase()}` : ""}`;
    body += pill(right, 214, label, { size: 28, height: 60, pad: 26, fill: "url(#badge)", color: T.ink, anchor: "end" }).svg;
  }
  const peak = input.points.reduce<FleetPoint | null>((best, point) => (!best || point.peak > best.peak ? point : best), null);
  const multiDay = input.to - input.from > 26 * HOUR;
  const when = (at: number) => `${multiDay ? `${DAYS[new Date(at).getUTCDay()]} ` : ""}${hhmm(at)}`;
  body += text(peak ? `${input.rangeLabel} · peak ${peak.peak.toLocaleString("en-US")} at ${when(peak.at)} UTC` : input.rangeLabel, P, 320, { size: 28, fill: T.fg, opacity: 0.5 });

  for (const fraction of [0, 0.5, 1]) {
    const gy = y(max * fraction);
    body += `<line x1="${left}" x2="${right}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="${T.fg}" stroke-opacity="${fraction === 0 ? 0.12 : 0.06}" stroke-dasharray="${fraction === 0 ? "" : "2 10"}" stroke-linecap="round"/>`;
    if (fraction > 0) body += text(compact(max * fraction), left, gy - 12, { size: 26, weight: 500, fill: T.fg, opacity: 0.35 });
  }
  for (const tick of timeTicks(input.from, input.to)) {
    const tx = x(tick.at);
    if (tx < left + 40 || tx > right - 40) continue;
    body += text(tick.label, tx, bottom + 52, { size: 26, weight: 500, fill: T.fg, opacity: 0.4, anchor: "middle" });
  }

  for (const part of segments(input.ghost, gap)) {
    const pts = part.map((point): Pt => [x(point.at + input.ghostShift), y(point.players)]);
    body += `<path d="${smooth(pts)}" fill="none" stroke="${T.fg}" stroke-opacity="0.32" stroke-width="4" stroke-dasharray="0.1 11" stroke-linecap="round"/>`;
  }
  for (const part of segments(input.points, gap)) body += lineSvg({ points: part.map((point): Pt => [x(point.at), y(point.players)]), baseline: bottom, color: T.fg, width: 6, fillId: "under" });

  if (peak) {
    const px = x(peak.at);
    const py = y(peak.peak);
    const label = `Peak ${peak.peak.toLocaleString("en-US")}`;
    const width = measure(label, { size: 26, weight: 600 }) + 36;
    const cx = Math.min(right - width / 2, Math.max(left + width / 2, px));
    body += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="8" fill="${T.canvas}" stroke="${T.fg}" stroke-width="4"/>`;
    body += pill(cx, py - 42, label, { size: 26, height: 46, pad: 18, fill: T.fg, opacity: 0.12, color: T.fg, anchor: "middle" }).svg;
  }
  const last = input.points.at(-1);
  if (last) body += endDot([x(last.at), y(last.players)], T.fg);
  if (!input.points.length) body += centered("Collecting data, check back in a few minutes", W / 2, (top + bottom) / 2, { size: 30, weight: 500, fill: T.fg, opacity: 0.5, anchor: "middle" });
  return frame(height, body, fade("under", T.fg));
};

const statTile = (x: number, y: number, w: number, h: number, icon: string, label: string, value: string, unit: string, sub: string, color = T.fg): string => {
  let out = tile(x, y, w, h) + heading(x + 32, y + 52, icon, label, 30);
  const style = { size: 76, weight: 700 as Weight, fill: color };
  out += text(value, x + 30, y + 160, style);
  if (unit) out += text(unit, x + 30 + measure(value, style) + (unit === "%" ? 2 : 8), y + 160, { size: 34, weight: 500, fill: T.fg, opacity: 0.4 });
  out += text(sub, x + 32, y + 210, { size: 27, fill: T.fg, opacity: 0.5 });
  return out;
};

export const fleetBoard = (servers: readonly ServerRow[]): string => {
  const columns = 2;
  const tileW = (W - GAP * (columns - 1)) / columns;
  const tileH = 176;
  const shown = servers.length > 12 ? servers.slice(0, 11) : servers.slice(0, 12);
  const rows = Math.ceil((shown.length + (servers.length > shown.length ? 1 : 0)) / columns) || 1;
  const gridTop = 248 + GAP;
  const regionsTop = gridTop + rows * (tileH + GAP);
  const players = servers.reduce((sum, server) => sum + server.playing, 0);
  const capacity = servers.reduce((sum, server) => sum + server.maxPlayers, 0);
  const weighted = (key: "fps" | "ping") => (players ? servers.reduce((sum, server) => sum + server[key] * server.playing, 0) / players : 0);
  const fps = weighted("fps");
  const pings = servers.map((server) => server.ping);
  const slow = servers.filter((server) => server.fps < 50).length;

  let body = "";

  const ratio = capacity ? players / capacity : 0;
  const statW = (W - GAP * 2) / 3;
  body += statTile(0, 0, statW, 248, "pie", "Capacity", `${Math.round(ratio * 100)}`, "%", `${players.toLocaleString("en-US")} of ${capacity.toLocaleString("en-US")}`);
  const ringX = statW - 100;
  const ringY = 124;
  const r = 56;
  const circumference = 2 * Math.PI * r;
  body += `<circle cx="${ringX}" cy="${ringY}" r="${r}" fill="none" stroke="${T.fg}" stroke-opacity="0.08" stroke-width="16"/>`;
  if (ratio > 0) body += `<circle cx="${ringX}" cy="${ringY}" r="${r}" fill="none" stroke="${T.fg}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${(circumference * Math.min(1, ratio)).toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 ${ringX} ${ringY})"/>`;
  body += statTile(statW + GAP, 0, statW, 248, "gears", "Server FPS", fps.toFixed(1), "", slow ? `${slow} server${slow === 1 ? "" : "s"} under 50` : "every server above 50", fpsColor(fps));
  body += statTile((statW + GAP) * 2, 0, statW, 248, "clock", "Ping", `${Math.round(weighted("ping"))}`, "ms", pings.length ? `best ${Math.min(...pings)} ms · worst ${Math.max(...pings)} ms` : "no servers");

  shown.forEach((server, index) => {
    const x = (index % columns) * (tileW + GAP);
    const y = gridTop + Math.floor(index / columns) * (tileH + GAP);
    const middle = y + 54;
    body += tile(x, y, tileW, tileH);
    const code = server.countryCode ? pill(x + 28, middle, server.countryCode, { size: 24, height: 42, pad: 14, fill: T.fg, opacity: 0.08, color: T.fg }) : { svg: "", width: -14 };
    const countStyle = { size: 40, weight: 600 as Weight, fill: T.fg };
    const maxStyle = { size: 28, weight: 500 as Weight, fill: T.fg, opacity: 0.4 };
    const count = String(server.playing);
    const of = `/${server.maxPlayers}`;
    const countWidth = measure(count, countStyle) + 4 + measure(of, maxStyle);
    const city = fit(server.city ?? server.country ?? "Locating…", { size: 36, weight: 600 }, tileW - 56 - code.width - 14 - countWidth - 16);
    body += code.svg + centered(city, x + 28 + code.width + 14, middle, { size: 36, weight: 600, fill: T.fg });
    body += centered(count, x + tileW - 28 - countWidth, middle, countStyle) + centered(of, x + tileW - 28, middle, { ...maxStyle, anchor: "end" });
    const barW = tileW - 56;
    const fill = server.maxPlayers ? Math.min(1, server.playing / server.maxPlayers) : 0;
    body += rect(x + 28, y + 94, barW, 14, 7, T.fg, 0.08);
    if (fill > 0) body += rect(x + 28, y + 94, Math.max(14, barW * fill), 14, 7, fpsColor(server.fps));
    const meta = `${server.fps.toFixed(0)} FPS · ${server.ping} ms · up ${duration(Date.now() - server.firstSeen)}`;
    body += centered(meta, x + 28, y + 142, { size: 28, weight: 500, fill: T.fg, opacity: 0.5 });
  });
  if (servers.length > shown.length) {
    const index = shown.length;
    const x = (index % columns) * (tileW + GAP);
    const y = gridTop + Math.floor(index / columns) * (tileH + GAP);
    body += tile(x, y, tileW, tileH) + centered(`+${servers.length - shown.length} more in the menu below`, x + tileW / 2, y + tileH / 2, { size: 32, weight: 600, fill: T.fg, opacity: 0.6, anchor: "middle" });
  }
  if (!servers.length) body += centered("No public servers right now", W / 2, gridTop + tileH / 2, { size: 30, weight: 500, fill: T.fg, opacity: 0.5, anchor: "middle" });

  const regions = new Map<string, number>();
  for (const server of servers) regions.set(server.country ?? "Unknown", (regions.get(server.country ?? "Unknown") ?? 0) + server.playing);
  const sorted = [...regions.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 6);
  const other = sorted.slice(6).reduce((sum, [, count]) => sum + count, 0);
  if (other) top.push(["Other", other]);
  const inner = 40;
  const legend: { name: string; count: number; shade: number; x: number; y: number }[] = [];
  let lx = inner;
  let ly = regionsTop + 186;
  for (const [index, [name, count]] of top.entries()) {
    const width = 20 + 12 + measure(`${name} ${count}`, { size: 30, weight: 500 }) + 40;
    if (lx + width > W - inner) {
      lx = inner;
      ly += 54;
    }
    legend.push({ name, count, shade: REGION_SHADES[index] ?? 0.08, x: lx, y: ly });
    lx += width;
  }
  const height = ly + 56;
  body += tile(0, regionsTop, W, height - regionsTop) + heading(inner, regionsTop + 62, "globe", "Regions");
  let bx = inner;
  const barWidth = W - inner * 2;
  top.forEach(([, count], index) => {
    const w = players ? (count / players) * barWidth : barWidth / top.length;
    body += rect(bx, regionsTop + 108, Math.max(4, w - 6), 20, 10, T.fg, REGION_SHADES[index] ?? 0.08);
    bx += w;
  });
  for (const item of legend) {
    body += `<circle cx="${item.x + 10}" cy="${item.y}" r="10" fill="${T.fg}" fill-opacity="${item.shade}"/>`;
    body += centered(item.name, item.x + 32, item.y, { size: 30, weight: 500, fill: T.fg, opacity: 0.8 });
    body += centered(String(item.count), item.x + 32 + measure(`${item.name} `, { size: 30, weight: 500 }), item.y, { size: 30, weight: 500, fill: T.fg, opacity: 0.4 });
  }
  return frame(height, body);
};

export interface ServerContext {
  rank: number;
  total: number;
  latestVersion: number | null;
}

export const serverChart = (server: ServerRow, series: readonly ServerPoint[], context: ServerContext = { rank: 0, total: 0, latestVersion: null }): string => {
  const headerH = 368;
  let body = tile(0, 0, W, headerH, 40) + heading(P, 100, "map-pin", `Server #${server.jobId.split("-").slice(1, 3).join("-")}`);
  const uptime = `Up ${duration(Date.now() - server.firstSeen)}`;
  body += pill(W - P, 100, uptime, { size: 26, height: 56, pad: 24, fill: "url(#badge)", color: T.ink, anchor: "end" }).svg;
  const title = fit(server.city ?? server.country ?? "Unknown location", { size: 104, weight: 700 }, W - P * 2 - 200);
  const titleStyle = { size: 104, weight: 700 as Weight, fill: T.fg };
  body += text(title, P - 4, 250, titleStyle);
  if (server.countryCode) body += pill(P + measure(title, titleStyle) + 22, 214, server.countryCode, { size: 28, height: 52, pad: 18, fill: T.fg, opacity: 0.1, color: T.fg }).svg;
  const behind = context.latestVersion && server.placeVersion ? context.latestVersion - server.placeVersion : 0;
  const facts = [
    [server.region, server.country].filter(Boolean).join(", "),
    server.datacenterId ? `datacenter ${server.datacenterId}` : "",
    server.placeVersion ? `v${server.placeVersion}${behind > 0 ? ` (${behind} behind)` : ""}` : "",
    context.rank ? `#${context.rank} of ${context.total} by players` : "",
  ].filter(Boolean);
  body += text(facts.join(" · "), P, 312, { size: 30, fill: T.fg, opacity: 0.55 });

  const tileW = (W - GAP * 2) / 3;
  const tileTop = headerH + GAP;
  const tileH = 426;
  const height = tileTop + tileH;
  const from = series[0]?.at ?? Date.now() - HOUR;
  const to = Math.max(series.at(-1)?.at ?? Date.now(), from + 600_000);
  const latest = series.at(-1);
  const metrics = [
    { icon: "user", label: "Players", value: String(server.playing), unit: `/${server.maxPlayers}`, color: T.fg, pick: (p: ServerPoint) => p.playing, max: Math.max(server.maxPlayers, 10) },
    { icon: "gears", label: "Server FPS", value: server.fps.toFixed(1), unit: "", color: fpsColor(server.fps), pick: (p: ServerPoint) => p.fps, max: 62 },
    { icon: "clock", label: "Ping", value: String(server.ping), unit: "ms", color: T.fg, pick: (p: ServerPoint) => p.ping, max: niceMax(Math.max(0, ...series.map((p) => p.ping)), 100) },
  ];
  let defs = "";
  metrics.forEach((metric, index) => {
    const x = index * (tileW + GAP);
    body += tile(x, tileTop, tileW, tileH) + heading(x + 32, tileTop + 52, metric.icon, metric.label, 30);
    const style = { size: 76, weight: 700 as Weight, fill: metric.color };
    body += text(metric.value, x + 30, tileTop + 160, style);
    if (metric.unit) body += text(metric.unit, x + 30 + measure(metric.value, style) + 8, tileTop + 160, { size: 34, weight: 500, fill: T.fg, opacity: 0.4 });
    const values = series.map(metric.pick);
    if (values.length) body += text(`low ${Math.round(Math.min(...values))} · high ${Math.round(Math.max(...values))}`, x + 32, tileTop + 208, { size: 27, weight: 500, fill: T.fg, opacity: 0.45 });
    const gx0 = x + 32;
    const gx1 = x + tileW - 40;
    const gy0 = tileTop + 252;
    const gy1 = tileTop + tileH - 40;
    const gx = (at: number) => gx0 + ((at - from) / (to - from || 1)) * (gx1 - gx0);
    const gy = (value: number) => gy1 - (Math.min(metric.max, Math.max(0, value)) / metric.max) * (gy1 - gy0);
    defs += fade(`metric${index}`, metric.color, 0.18);
    body += `<line x1="${gx0}" x2="${gx1}" y1="${gy1}" y2="${gy1}" stroke="${T.fg}" stroke-opacity="0.08"/>`;
    for (const part of segments(series, 10 * 60_000)) body += lineSvg({ points: part.map((p): Pt => [gx(p.at), gy(metric.pick(p))]), baseline: gy1, color: metric.color, width: 5, fillId: `metric${index}` });
    if (latest) body += endDot([gx(latest.at), gy(metric.pick(latest))], metric.color);
    if (series.length < 2) body += centered("Not enough samples yet", x + tileW / 2, (gy0 + gy1) / 2, { size: 24, weight: 500, fill: T.fg, opacity: 0.4, anchor: "middle" });
  });
  return frame(height, body, defs);
};

export const heatmap = (hours: readonly { at: number; players: number }[]): { svg: string; busiest: { day: number; hour: number; players: number } | null; quietest: { day: number; hour: number; players: number } | null } => {
  const sums = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ total: 0, count: 0 })));
  for (const entry of hours) {
    const date = new Date(entry.at);
    const cell = sums[(date.getUTCDay() + 6) % 7]![date.getUTCHours()]!;
    cell.total += entry.players;
    cell.count += 1;
  }
  const values = sums.map((row) => row.map((cell) => (cell.count ? cell.total / cell.count : null)));
  const filled = values.flatMap((row, day) => row.map((players, hour) => ({ day, hour, players }))).filter((cell): cell is { day: number; hour: number; players: number } => cell.players !== null);
  const max = Math.max(1, ...filled.map((cell) => cell.players));
  const min = Math.min(max, ...filled.map((cell) => cell.players));
  const best = filled.reduce<(typeof filled)[number] | null>((a, b) => (!a || b.players > a.players ? b : a), null);
  const worst = filled.reduce<(typeof filled)[number] | null>((a, b) => (!a || b.players < a.players ? b : a), null);

  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const labelW = 84;
  const gridLeft = P + labelW;
  const cell = (W - P - gridLeft) / 24;
  const rowH = cell + 6;
  const top = 170;
  const height = top + rowH * 7 + 96;
  let body = card(height) + heading(P, 100, "calendar", "Average players by hour");
  const steps = 6;
  const scaleRight = W - P;
  const swatch = 30;
  const scaleW = steps * (swatch + 6) - 6;
  body += centered("More", scaleRight, 100, { size: 24, weight: 500, fill: T.fg, opacity: 0.5, anchor: "end" });
  const scaleLeft = scaleRight - measure("More", { size: 24, weight: 500 }) - 14 - scaleW;
  for (let i = 0; i < steps; i += 1) body += rect(scaleLeft + i * (swatch + 6), 100 - swatch / 2, swatch, swatch, 8, T.fg, 0.05 + (i / (steps - 1)) * 0.85);
  body += centered("Fewer", scaleLeft - 14, 100, { size: 24, weight: 500, fill: T.fg, opacity: 0.5, anchor: "end" });

  values.forEach((row, day) => {
    const y = top + day * rowH;
    body += centered(labels[day]!, P, y + (rowH - 6) / 2, { size: 24, weight: 500, fill: T.fg, opacity: 0.7 });
    row.forEach((value, hour) => {
      const x = gridLeft + hour * cell;
      const size = cell - 6;
      if (value === null) {
        body += `<rect x="${(x + 3).toFixed(1)}" y="${(y + 0.5).toFixed(1)}" width="${(size - 1).toFixed(1)}" height="${(size - 1).toFixed(1)}" rx="10" fill="none" stroke="${T.fg}" stroke-opacity="0.07" stroke-width="1.5"/>`;
        return;
      }
      const t = max === min ? 1 : (value - min) / (max - min);
      body += rect(x + 3, y, size, size, 10, T.fg, 0.05 + t * 0.85);
      if (best && best.day === day && best.hour === hour) body += `<rect x="${(x - 1).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="${(size + 8).toFixed(1)}" height="${(size + 8).toFixed(1)}" rx="13" fill="none" stroke="${T.fg}" stroke-width="2.5"/>`;
    });
  });
  for (let hour = 0; hour < 24; hour += 3) body += text(`${String(hour).padStart(2, "0")}:00`, gridLeft + hour * cell + cell / 2, top + rowH * 7 + 40, { size: 22, weight: 500, fill: T.fg, opacity: 0.4, anchor: "middle" });
  if (!filled.length) body += centered("Collecting data, the map fills in over the first week", W / 2, top + (rowH * 7) / 2, { size: 30, weight: 500, fill: T.fg, opacity: 0.6, anchor: "middle" });
  body += text("UTC", W - P, top + rowH * 7 + 40, { size: 22, weight: 500, fill: T.fg, opacity: 0.3, anchor: "end" });
  return { svg: frame(height, body), busiest: best, quietest: worst };
};

export const png = async (svg: string): Promise<Buffer> => sharp(Buffer.from(svg), { density: 96 }).png({ compressionLevel: 9 }).toBuffer();
