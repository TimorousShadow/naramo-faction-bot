// TimorousShadow
import emojis from "./emojis.json" with { type: "json" };
import type { CheckResult, CheckState, SafetyReport, WatcherData, WatcherGuild } from "./safety.js";
import { GAP, T, W, fit, frame, pill, png, rect, tile } from "./servers/charts.js";
import { centered, measure, papicon, text, type Weight } from "./servers/type.js";

export interface CardSubject {
  discord: { id: string; username: string; displayName: string | null; avatar: string; created: number } | null;
  roblox: { id: string; name: string; created: number | null; avatar: string | null } | null;
  note: string;
  globalBan: boolean;
}

const MAX_HEIGHT = 1900;
const PAD = 40;
const STATE: Record<CheckState, { icon: string; color: string; label: string }> = {
  flagged: { icon: "alert-triangle", color: "#f87171", label: "Flagged" },
  pending: { icon: "clock", color: "#f5c451", label: "Pending" },
  clear: { icon: "check", color: "#5fd99a", label: "Clear" },
  error: { icon: "alert-circle", color: "#f5c451", label: "Failed" },
  skipped: { icon: "minus", color: "#9ca3af", label: "Skipped" },
};
const LOGOS: [string, string][] = [
  ["Rotector", "rotector"],
  ["ServerSweep", "serversweep"],
  ["Okappiki", "okappiki"],
  ["RAB", "rab"],
  ["TASE", "tase"],
  ["Roblox Watcher", "robloxwatcher"],
  ["Exploit Watcher", "robloxwatcher"],
  ["Simmer", "simmer"],
  ["X Tracker", "xtracker"],
  ["Cat Watcher", "catwatcher"],
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const images = new Map<string, string | null>();

const dataUri = async (url: string | null | undefined): Promise<string | null> => {
  if (!url) return null;
  if (images.has(url)) return images.get(url)!;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const type = response.headers.get("content-type") ?? "image/png";
    const value = response.ok && type.startsWith("image/") ? `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}` : null;
    images.set(url, value);
    return value;
  } catch {
    return null;
  }
};

const logoUrl = (check: string): string | null => {
  const match = LOGOS.find(([prefix]) => check.startsWith(prefix));
  const id = match ? (emojis as Record<string, string>)[`nf_logo_${match[1]}`] : undefined;
  return id ? `https://cdn.discordapp.com/emojis/${id}.png?size=96` : null;
};

const robloxHeadshot = async (id: string): Promise<string | null> => {
  try {
    const response = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png`, { signal: AbortSignal.timeout(8000) });
    return ((await response.json()) as { data?: { imageUrl?: string }[] }).data?.[0]?.imageUrl ?? null;
  } catch {
    return null;
  }
};

let clip = 0;
const image = (href: string | null, x: number, y: number, size: number, round: number): string => {
  if (!href) return rect(x, y, size, size, round, T.fg, 0.08);
  const id = `img${(clip += 1)}`;
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${round}"/></clipPath><image clip-path="url(#${id})" href="${href}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice"/>`;
};

const date = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const ago = (ms: number): string => {
  const diff = Date.now() - ms;
  const future = diff < 0;
  const abs = Math.abs(diff);
  const units: [number, string][] = [[365 * 864e5, "year"], [30 * 864e5, "month"], [7 * 864e5, "week"], [864e5, "day"], [36e5, "hour"], [6e4, "minute"]];
  for (const [size, name] of units) {
    const count = Math.floor(abs / size);
    if (count >= 1) return future ? `in ${count} ${name}${count === 1 ? "" : "s"}` : `${count} ${name}${count === 1 ? "" : "s"} ago`;
  }
  return "just now";
};

const plain = (value: string): string =>
  value
    .replace(/<t:(\d+):([a-zA-Z])>/g, (_, seconds: string, style: string) => (style === "R" ? ago(Number(seconds) * 1000) : date(Number(seconds) * 1000)))
    .replace(/<@&?(\d+)>/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\\([\\`*_~|>#-])/g, "$1");

interface Token {
  text: string;
  chip: boolean;
  bold: boolean;
}

const tokens = (line: string): Token[] => {
  const out: Token[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    if (match.index! > last) out.push({ text: plain(line.slice(last, match.index)), chip: false, bold: false });
    if (match[1] !== undefined) out.push({ text: plain(match[1]), chip: !/^[\d.,]+$/.test(match[1]), bold: /^[\d.,]+$/.test(match[1]) });
    else if (match[2] !== undefined) out.push({ text: plain(match[2]), chip: false, bold: true });
    else out.push({ text: plain(match[3]!), chip: true, bold: false });
    last = match.index! + match[0].length;
  }
  if (last < line.length) out.push({ text: plain(line.slice(last)), chip: false, bold: false });
  return out.filter((token) => token.text.trim());
};

interface Flow {
  svg: string;
  height: number;
}

const flow = (parts: Token[], x: number, top: number, width: number, size: number, weight: Weight, opacity: number, maxLines = Infinity): Flow => {
  const lineHeight = Math.round(size * 1.55);
  const chipH = Math.round(size * 1.3);
  const space = measure("a a", { size, weight }) - measure("aa", { size, weight });
  let cx = x;
  let line = 0;
  let svg = "";
  let afterChip = false;
  const middle = () => top + line * lineHeight + lineHeight / 2;
  const newline = (): boolean => {
    line += 1;
    cx = x;
    return line < maxLines;
  };
  for (const part of parts) {
    if (part.chip) {
      const label = fit(part.text, { size: size - 4, weight: 600 }, width - 32);
      const w = measure(label, { size: size - 4, weight: 600 }) + 28;
      if (cx > x && !afterChip) cx += 10;
      if (cx > x && cx + w > x + width && !newline()) break;
      svg += pill(cx, middle(), label, { size: size - 4, height: chipH, pad: 14, fill: T.fg, opacity: 0.09, color: T.fg }).svg;
      cx += w + 6;
      afterChip = true;
      continue;
    }
    const style = { size, weight: part.bold ? (Math.max(weight, 600) as Weight) : weight };
    let stopped = false;
    for (const word of part.text.split(/(\s+)/)) {
      if (!word) continue;
      if (/^\s+$/.test(word)) {
        if (cx > x && !afterChip) cx += space;
        continue;
      }
      const w = measure(word, style);
      if (cx > x && cx + w > x + width && !newline()) {
        stopped = true;
        break;
      }
      if (afterChip && /^[^.,:;)]/.test(word)) cx += 4;
      afterChip = false;
      svg += centered(word, cx, middle(), { ...style, fill: T.fg, opacity: part.bold ? Math.max(opacity, 0.95) : opacity });
      cx += w;
    }
    if (stopped) break;
  }
  return { svg, height: (Math.min(line, maxLines - 1) + 1) * lineHeight };
};

type Rich = { kind: "space" } | { kind: "quote" | "heading" | "small" | "bullet" | "sub" | "body"; parts: Token[] };

const parse = (lines: readonly string[]): Rich[] =>
  lines.flatMap((line) => line.split("\n")).map((raw): Rich => {
    if (!raw.trim()) return { kind: "space" };
    if (raw.startsWith("  -# ")) return { kind: "sub", parts: tokens(raw.slice(5)) };
    if (raw.startsWith("-# ")) return { kind: "small", parts: tokens(raw.slice(3)) };
    if (raw.startsWith("> ")) return { kind: "quote", parts: tokens(raw.slice(2)) };
    if (raw.startsWith("- ")) return { kind: "bullet", parts: tokens(raw.slice(2)) };
    if (/^\*\*[^*]+\*\*/.test(raw)) return { kind: "heading", parts: tokens(raw) };
    return { kind: "body", parts: tokens(raw) };
  });

const richLine = (item: Rich, x: number, top: number, width: number): Flow => {
  if (item.kind === "space") return { svg: "", height: 14 };
  if (item.kind === "quote") {
    const body = flow(item.parts, x + 24, top, width - 24, 30, 500, 0.8);
    return { svg: rect(x, top + 6, 5, body.height - 12, 3, T.fg, 0.3) + body.svg, height: body.height + 6 };
  }
  if (item.kind === "heading") return flow(item.parts, x, top + 8, width, 32, 600, 0.95);
  if (item.kind === "small") return flow(item.parts, x, top, width, 24, 500, 0.5);
  if (item.kind === "sub") return flow(item.parts, x + 30, top - 6, width - 30, 24, 500, 0.55);
  if (item.kind === "bullet") {
    const body = flow(item.parts, x + 30, top, width - 30, 28, 500, 0.9);
    return { svg: `<circle cx="${x + 9}" cy="${top + 22}" r="5" fill="${T.fg}" fill-opacity="0.45"/>${body.svg}`, height: body.height };
  }
  return flow(item.parts, x, top, width, 28, 400, 0.8);
};

interface Card {
  height: number;
  draw: (y: number) => string;
}

const stack = (cards: Card[]): string[] => {
  const pages: string[] = [];
  let body = "";
  let y = 0;
  for (const card of cards) {
    if (y > 0 && y + card.height > MAX_HEIGHT) {
      pages.push(frame(y - GAP, body));
      body = "";
      y = 0;
    }
    body += card.draw(y);
    y += card.height + GAP;
  }
  if (body) pages.push(frame(y - GAP, body));
  return pages;
};

const providerHeader = (check: CheckResult, logo: string | null, x: number, middle: number, width: number, suffix = ""): string => {
  const state = STATE[check.state];
  let out = image(logo, x, middle - 24, 48, 12);
  const nameStyle = { size: 36, weight: 700 as Weight, fill: T.fg };
  const label = pill(x + width, middle, state.label, { size: 24, height: 46, pad: 18, fill: state.color, opacity: 0.16, color: state.color, anchor: "end" });
  out += centered(fit(`${check.name.replace(" via Rayward", "")}${suffix}`, nameStyle, width - 80 - label.width), x + 66, middle, nameStyle);
  out += label.svg;
  return out;
};

const detailCards = (check: CheckResult, logo: string | null, skip: (line: string) => boolean = () => false): Card[] => {
  const width = W - PAD * 2;
  const items = parse((check.details ?? []).filter((line) => !skip(line)));
  const flows: Flow[] = [];
  let probe = 0;
  for (const item of items) {
    const f = richLine(item, PAD, probe, width);
    flows.push(f);
    probe += f.height;
  }
  const cards: Card[] = [];
  let start = 0;
  let part = 0;
  while (start < items.length || part === 0) {
    const headerH = 118;
    let used = headerH;
    let end = start;
    while (end < items.length && (used + flows[end]!.height <= MAX_HEIGHT - PAD || end === start)) {
      used += flows[end]!.height;
      end += 1;
    }
    const slice = items.slice(start, end);
    const height = used + PAD;
    const suffix = part > 0 ? " (continued)" : "";
    cards.push({
      height,
      draw: (y) => {
        let out = tile(0, y, W, height, 36) + providerHeader(check, logo, PAD, y + 62, width, suffix);
        let cy = y + headerH;
        for (const item of slice) {
          const f = richLine(item, PAD, cy, width);
          out += f.svg;
          cy += f.height;
        }
        return out;
      },
    });
    start = end;
    part += 1;
    if (!items.length) break;
  }
  return cards;
};

const membershipState = (guild: WatcherGuild): "in" | "left" | "unknown" => {
  const latest = (values?: string[]) => Math.max(0, ...(values ?? []).map((value) => Date.parse(value)).filter((value) => !Number.isNaN(value)));
  if ((guild.guildLeaves ?? []).length && latest(guild.guildLeaves) >= latest(guild.guildJoins)) return "left";
  return (guild.guildJoins ?? []).length || guild.estimatedJoin ? "in" : "unknown";
};

const ACTIVITY_LABELS: Record<string, string> = {
  messages: "messages",
  slashCommands: "slash commands",
  typing: "typing",
  reactions: "reactions",
  vcJoins: "VC joins",
  boosts: "boosts",
  nsfwRequests: "NSFW requests",
  rr34Requests: "rule 34 requests",
  erpInteractions: "ERP interactions",
  scriptRequests: "script requests",
  bypassBotUsages: "bypass bot uses",
};

const guildTile = (guild: WatcherGuild, width: number): { height: number; draw: (x: number, y: number) => string } => {
  const inner = width - PAD * 2;
  const state = membershipState(guild);
  const stateIcon = state === "in" ? { icon: "login", color: "#5fd99a", label: "In server" } : state === "left" ? { icon: "logout", color: "#f87171", label: "Left" } : { icon: "minus", color: "#9ca3af", label: "Unknown" };
  const chips: Token[] = [
    ...(guild.guildTypes ?? []).flatMap((type) => (type.name ? [{ text: type.name, chip: true, bold: false }] : [])),
    ...(guild.guildFlags ?? []).map((flag) => ({ text: flag, chip: true, bold: false })),
  ];
  const dates = (values?: string[]) => (values ?? []).map((value) => Date.parse(value)).filter((value) => !Number.isNaN(value)).map(date);
  const joins = dates(guild.guildJoins);
  const leaves = dates(guild.guildLeaves);
  const membership = guild.membership ?? {};
  const facts = [
    joins.length ? `Joined ${joins.join(", ")}` : guild.estimatedJoin ? `Joined around ${date(Date.parse(guild.estimatedJoin))}` : "Join date unknown",
    leaves.length ? `left ${leaves.join(", ")}` : "",
    guild.lastActivity ? `last active ${ago(Date.parse(guild.lastActivity))}` : "",
    `score ${Math.round((guild.score ?? 0) * 100) / 100}`,
    guild.detectionVersion ? `detection v${guild.detectionVersion}` : "",
    membership.owner === true ? "owner" : "",
    membership.staff === true ? "staff" : "",
  ].filter(Boolean);
  const activity = Object.entries(guild.activity ?? {})
    .filter(([key, value]) => typeof value === "number" && value > 0 && ACTIVITY_LABELS[key])
    .map(([key, value]) => ({ text: `${value} ${ACTIVITY_LABELS[key]}`, chip: true, bold: false }));
  const roles = (guild.roles ?? []).map((role) => ({ text: role.type ? `${role.name} (${role.type})` : role.name, chip: true, bold: false }));
  const permissions = (membership.allTimePermissions ?? []).map((permission) => ({ text: permission, chip: true, bold: false }));
  const blocks: { label: string | null; parts: Token[]; size: number; weight: Weight; opacity: number }[] = [
    ...(chips.length ? [{ label: null, parts: chips, size: 26, weight: 500 as Weight, opacity: 0.9 }] : []),
    { label: null, parts: [{ text: facts.join(" · "), chip: false, bold: false }], size: 26, weight: 500, opacity: 0.6 },
    ...(activity.length ? [{ label: "Activity", parts: activity, size: 24, weight: 500 as Weight, opacity: 0.9 }] : []),
    ...(roles.length ? [{ label: "Roles", parts: roles, size: 24, weight: 500 as Weight, opacity: 0.9 }] : []),
    ...(permissions.length ? [{ label: "Permissions", parts: permissions, size: 24, weight: 500 as Weight, opacity: 0.9 }] : []),
  ];
  const measureBlocks = (x: number, y: number) => {
    let svg = "";
    let cy = y;
    for (const block of blocks) {
      if (block.label) {
        svg += text(block.label, x, cy + 24, { size: 22, weight: 600, fill: T.fg, opacity: 0.45 });
        cy += 34;
      }
      const f = flow(block.parts, x, cy, inner, block.size, block.weight, block.opacity);
      svg += f.svg;
      cy += f.height + 8;
    }
    return { svg, height: cy - y };
  };
  const headerH = 112;
  const height = headerH + measureBlocks(0, 0).height + PAD - 8;
  return {
    height,
    draw: (x, y) => {
      let out = tile(x, y, width, height);
      out += papicon(stateIcon.icon, x + PAD, y + 34, 34, stateIcon.color);
      const nameStyle = { size: 32, weight: 700 as Weight, fill: T.fg };
      out += centered(fit(guild.name || "Unknown server", nameStyle, inner - 50), x + PAD + 48, y + 51, nameStyle);
      out += centered(`${stateIcon.label} · ${guild.id}`, x + PAD, y + 92, { size: 22, weight: 500, fill: T.fg, opacity: 0.45 });
      out += measureBlocks(x + PAD, y + headerH).svg;
      return out;
    },
  };
};

const watcherCards = (check: CheckResult, data: WatcherData, logo: string | null): Card[] => {
  const types = new Map<string, string>();
  for (const guild of data.guilds) for (const type of guild.guildTypes ?? []) if (type.name && type.description) types.set(type.name, type.description);
  const active = data.guilds.some((guild) => Object.values(guild.activity ?? {}).some((value) => typeof value === "number" && value > 0));
  const summary = [
    `Total score \`${Math.round(data.totalScore * 100) / 100}\` across \`${data.guilds.length}\` server${data.guilds.length === 1 ? "" : "s"}${active ? "" : ", no recorded activity, flagged for membership only"}`,
    ...[...types.entries()].map(([name, description]) => `- \`${name}\` ${description}`),
  ];
  const cards = detailCards({ ...check, details: summary }, logo);
  const columns = 2;
  const width = (W - GAP) / columns;
  const guilds = [...data.guilds].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((guild) => guildTile(guild, width));
  const limit = MAX_HEIGHT - 400;
  let placed: { entry: (typeof guilds)[number]; column: number; top: number }[] = [];
  let heights = [0, 0];
  const flush = () => {
    if (!placed.length) return;
    const block = placed;
    const height = Math.max(...heights) - GAP;
    cards.push({ height, draw: (y) => block.map((item) => item.entry.draw(item.column * (width + GAP), y + item.top)).join("") });
    placed = [];
    heights = [0, 0];
  };
  for (const entry of guilds) {
    let column = heights[0]! <= heights[1]! ? 0 : 1;
    if (heights[column]! + entry.height > limit && placed.length) {
      flush();
      column = 0;
    }
    placed.push({ entry, column, top: heights[column]! });
    heights[column] = heights[column]! + entry.height + GAP;
  }
  flush();
  return cards;
};

const overviewCards = async (subject: CardSubject, report: SafetyReport, logos: Map<string, string | null>): Promise<Card[]> => {
  const cards: Card[] = [];
  const flagged = report.checks.filter((check) => check.state === "flagged").length;
  const ran = report.checks.filter((check) => check.state !== "skipped" && check.state !== "error").length;
  const discordAvatar = await dataUri(subject.discord?.avatar);
  const robloxAvatar = subject.roblox ? await dataUri(subject.roblox.avatar ?? (await robloxHeadshot(subject.roblox.id))) : null;

  const identityH = 250;
  cards.push({
    height: identityH,
    draw: (y) => {
      let out = tile(0, y, W, identityH, 36);
      const title = subject.discord ? subject.discord.displayName || subject.discord.username : subject.roblox!.name;
      out += image(subject.discord ? discordAvatar : robloxAvatar, PAD, y + 45, 160, 80);
      const badge = pill(W - PAD, y + 80, `Flagged by ${flagged} of ${ran}`, { size: 28, height: 60, pad: 26, fill: "url(#badge)", color: T.ink, anchor: "end" });
      const titleStyle = { size: 64, weight: 700 as Weight, fill: T.fg };
      out += text(fit(title, titleStyle, W - PAD * 2 - 200 - badge.width - 20), 240, y + 112, titleStyle);
      const sub = subject.discord ? `@${subject.discord.username} · ${subject.discord.id}` : `Roblox ${subject.roblox!.id}`;
      out += text(sub, 240, y + 160, { size: 28, weight: 500, fill: T.fg, opacity: 0.55 });
      if (subject.discord) out += text(`Discord account created ${date(subject.discord.created)} (${ago(subject.discord.created)})`, 240, y + 202, { size: 26, weight: 500, fill: T.fg, opacity: 0.45 });
      out += badge.svg;
      if (subject.globalBan) out += pill(W - PAD, y + 160, "Globally banned", { size: 24, height: 48, pad: 20, fill: "#f87171", opacity: 0.18, color: "#f87171", anchor: "end" }).svg;
      return out;
    },
  });

  const linked = report.linkedDiscord;
  const accountH = subject.roblox ? 160 + linked.length * 52 + (linked.length ? 16 : 0) : 130;
  cards.push({
    height: accountH,
    draw: (y) => {
      let out = tile(0, y, W, accountH, 36);
      if (!subject.roblox) {
        out += papicon("link", PAD, y + 48, 34, T.fg, 0.6);
        out += centered(subject.note || "No linked Roblox account", PAD + 50, y + 65, { size: 30, weight: 500, fill: T.fg, opacity: 0.7 });
        return out;
      }
      out += image(robloxAvatar, PAD, y + 36, 88, 24);
      out += text(subject.roblox.name, PAD + 112, y + 76, { size: 38, weight: 700, fill: T.fg });
      out += text(`Roblox ${subject.roblox.id}${subject.roblox.created ? ` · created ${date(subject.roblox.created)}` : ""}`, PAD + 112, y + 114, { size: 26, weight: 500, fill: T.fg, opacity: 0.5 });
      linked.forEach((account, index) => {
        const middle = y + 168 + index * 52;
        out += papicon(account.flagged ? "alert-circle" : "user", PAD, middle - 15, 30, account.flagged ? "#f87171" : T.fg, account.flagged ? 1 : 0.6);
        out += centered(`Discord ${account.id}`, PAD + 44, middle, { size: 28, weight: 600, fill: T.fg });
        if (account.sources.length) out += centered(account.sources.join(" & "), W - PAD, middle, { size: 26, weight: 500, fill: T.fg, opacity: 0.5, anchor: "end" });
      });
      return out;
    },
  });

  const columns = 2;
  const width = (W - GAP) / columns;
  const tileH = 168;
  for (let index = 0; index < report.checks.length; index += columns) {
    const row = report.checks.slice(index, index + columns);
    cards.push({
      height: tileH,
      draw: (y) =>
        row
          .map((check, column) => {
            const x = column * (width + GAP);
            const state = STATE[check.state];
            let out = tile(x, y, width, tileH);
            out += image(logos.get(check.name) ?? null, x + 32, y + 30, 44, 11);
            const label = pill(x + width - 32, y + 52, state.label, { size: 22, height: 42, pad: 16, fill: state.color, opacity: 0.16, color: state.color, anchor: "end" });
            const nameStyle = { size: 30, weight: 700 as Weight, fill: T.fg };
            out += centered(fit(check.name.replace(" via Rayward", ""), nameStyle, width - 64 - 60 - label.width - 12), x + 92, y + 52, nameStyle);
            out += label.svg;
            out += flow(tokens(check.text), x + 32, y + 88, width - 64, 24, 500, 0.6, 2).svg;
            return out;
          })
          .join(""),
    });
  }
  return cards;
};

export const summaryImages = async (subject: CardSubject, report: SafetyReport): Promise<Buffer[]> => {
  const logos = new Map<string, string | null>();
  await Promise.all(report.checks.map(async (check) => logos.set(check.name, await dataUri(logoUrl(check.name)))));
  const overview = stack(await overviewCards(subject, report, logos));
  const details: Card[] = [];
  for (const check of report.checks) {
    if (check.state !== "flagged" && check.state !== "pending") continue;
    const logo = logos.get(check.name) ?? null;
    const watcher = check.name === "Roblox Watcher" ? report.robloxWatcher : check.name === "Exploit Watcher" ? report.exploitWatcher : null;
    if (watcher && watcher.guilds.length) details.push(...watcherCards(check, watcher, logo));
    else if (check.details?.length) details.push(...detailCards(check, logo, (line) => /^Status `[^`]+`$/.test(line)));
  }
  const pages = [...overview, ...stack(details)].slice(0, 10);
  return Promise.all(pages.map(png));
};
