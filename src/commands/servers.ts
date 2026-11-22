// TimorousShadow
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { ensureAccess } from "../access.js";
import { GAME_NAME, GAME_PLACE_ID } from "../config.js";
import { compact, fleetBoard, heatmap, playersChart, png, serverChart } from "../servers/charts.js";
import { collectorError } from "../servers/collector.js";
import {
  activeServers,
  fleetAt,
  fleetPeak,
  fleetSeries,
  gameAtOrBefore,
  gameLatest,
  hourlyAverages,
  serverByPrefix,
  serverRow,
  serverSeries,
  trackingSince,
  type FleetPoint,
  type ServerRow,
} from "../servers/history.js";
import { button, emoji, errorPanel, icon, line, linkButton, time, v2 } from "../ui.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const RANGES = {
  "6h": { span: 6 * HOUR, bucket: 60_000, shift: DAY, label: "Last 6 hours", ghost: "Yesterday" },
  "24h": { span: DAY, bucket: 5 * 60_000, shift: DAY, label: "Last 24 hours", ghost: "Yesterday" },
  "7d": { span: 7 * DAY, bucket: 30 * 60_000, shift: 7 * DAY, label: "Last 7 days", ghost: "Last week" },
  "30d": { span: 30 * DAY, bucket: 2 * HOUR, shift: 30 * DAY, label: "Last 30 days", ghost: "Previous 30 days" },
} as const;

type Range = keyof typeof RANGES;
const isRange = (value: string | undefined): value is Range => value !== undefined && value in RANGES;

export const serversCommand = new SlashCommandBuilder()
  .setName("servers")
  .setDescription(`Live public servers of ${GAME_NAME} with player and performance graphs`)
  .setDMPermission(false)
  .addStringOption((option) => option.setName("server").setDescription("Part of a server's job ID, for example 22dd-482e").setMinLength(4).setMaxLength(36));

const shortId = (jobId: string): string => `#${jobId.split("-").slice(1, 3).join("-")}`;
const place = (server: ServerRow): string => [server.city, server.country].filter(Boolean).join(", ") || "Unknown location";
const fill = (server: ServerRow): number => (server.maxPlayers ? Math.round((server.playing / server.maxPlayers) * 100) : 0);
const plural = (count: number, word: string): string => `${count.toLocaleString("en-US")} ${word}${count === 1 ? "" : "s"}`;

const duration = (ms: number): string => {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
};

const latestVersion = (servers: readonly ServerRow[]): number | null => Math.max(0, ...servers.map((server) => server.placeVersion ?? 0)) || null;

const media = (name: string, description: string): MediaGalleryBuilder =>
  new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${name}`).setDescription(description));

const divider = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

const average = (points: readonly FleetPoint[]): number | null => (points.length ? points.reduce((sum, point) => sum + point.players, 0) / points.length : null);

const pickers = (servers: readonly ServerRow[], range: Range, selected?: string): ActionRowBuilder<StringSelectMenuBuilder>[] => {
  const version = latestVersion(servers);
  const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  for (let offset = 0; offset < Math.min(servers.length, 50); offset += 25) {
    const options = servers.slice(offset, offset + 25).map((server, index) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${offset + index + 1}. ${server.city ?? server.country ?? "Unknown"} · ${server.playing}/${server.maxPlayers}`)
        .setDescription(
          [`${server.fps.toFixed(0)} FPS`, `${server.ping} ms`, `up ${duration(Date.now() - server.firstSeen)}`, server.placeVersion ? `v${server.placeVersion}${version && server.placeVersion < version ? " (old)" : ""}` : ""]
            .filter(Boolean)
            .join(" · "),
        )
        .setValue(server.jobId)
        .setDefault(server.jobId === selected),
    );
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`servers:pick:${range}:${offset}`)
          .setPlaceholder(servers.length > 25 ? `Open a server (${offset + 1}-${offset + options.length})` : "Open a server")
          .addOptions(options),
      ),
    );
  }
  return rows;
};

const rangeButtons = (range: Range, view: "overview" | "heat"): ActionRowBuilder<ReturnType<typeof button>> =>
  new ActionRowBuilder<ReturnType<typeof button>>().addComponents(
    ...(Object.keys(RANGES) as Range[]).map((key) => button(`servers:range:${key}`, key, view === "overview" && key === range ? ButtonStyle.Primary : ButtonStyle.Secondary)),
    button(`servers:heat:${range}`, "Week map", view === "heat" ? ButtonStyle.Primary : ButtonStyle.Secondary, "calendar"),
  );

interface View {
  components: ContainerBuilder[];
  files: AttachmentBuilder[];
}

const unavailable = (): View => ({
  components: [
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${icon("clock:amber")} ${GAME_NAME}\nNo server data yet. The bot reads the public server list once a minute, so try again shortly.${collectorError() ? `\n-# Last error: ${collectorError()}` : ""}`,
      ),
    ),
  ],
  files: [],
});

const overview = async (range: Range): Promise<View> => {
  const servers = activeServers();
  if (!servers.length && !trackingSince()) return unavailable();
  const config = RANGES[range];
  const now = Date.now();
  const from = now - config.span;
  const points = fleetSeries(from, now + 60_000, config.bucket);
  const ghost = fleetSeries(from - config.shift, now - config.shift + 60_000, config.bucket);
  const players = servers.reduce((sum, server) => sum + server.playing, 0);
  const capacity = servers.reduce((sum, server) => sum + server.maxPlayers, 0);
  const before = range === "6h" || range === "24h" ? fleetAt(now - DAY)?.players ?? null : average(ghost);
  const after = range === "6h" || range === "24h" ? players : average(points);
  const change = before && after !== null ? ((after - before) / before) * 100 : null;

  const [chart, board] = await Promise.all([
    png(playersChart({ points, ghost, ghostShift: config.shift, from, to: now, bucket: config.bucket, rangeLabel: config.label, ghostLabel: config.ghost, current: players, change })),
    png(fleetBoard(servers)),
  ]);

  const dayStart = Math.floor(now / DAY) * DAY;
  const peakToday = fleetPeak(dayStart);
  const peakRange = fleetPeak(from);
  const allTime = fleetPeak(0);
  const players24 = points.length ? Math.min(...fleetSeries(now - DAY, now, 5 * 60_000).map((point) => point.players)) : null;
  const weighted = (key: "fps" | "ping") => (players ? servers.reduce((sum, server) => sum + server[key] * server.playing, 0) / players : 0);
  const struggling = servers.filter((server) => server.fps < 35).length;
  const full = servers.filter((server) => server.playing >= server.maxPlayers - 1).length;
  const version = latestVersion(servers);
  const outdated = version ? servers.filter((server) => server.placeVersion !== null && server.placeVersion < version) : [];
  const regions = new Map<string, number>();
  for (const server of servers) regions.set(server.country ?? "Unknown", (regions.get(server.country ?? "Unknown") ?? 0) + 1);
  const game = gameLatest();
  const gameDayAgo = game ? gameAtOrBefore(game.at - DAY + 15 * 60_000) : undefined;
  const since = trackingSince();

  const details = [
    line("user", "Players", [`**${players.toLocaleString("en-US")}** now`, peakToday ? `peak today **${peakToday.players.toLocaleString("en-US")}** at ${time(peakToday.at, "t")}` : "", players24 !== null && Number.isFinite(players24) ? `24h low ${Math.round(players24)}` : ""].filter(Boolean).join(" · ")),
    line("grid", "Servers", [`**${servers.length}** public`, `${capacity.toLocaleString("en-US")} slots`, full ? `${full} full` : "", `${capacity ? Math.round((players / capacity) * 100) : 0}% filled`].filter(Boolean).join(" · ")),
    line("gears", "Performance", [`${weighted("fps").toFixed(1)} FPS`, `${Math.round(weighted("ping"))} ms ping`, struggling ? `**${plural(struggling, "server")}** under 35 FPS` : "every server above 35 FPS"].join(" · ")),
    line("globe", "Regions", [...regions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => `${name} ${count}`).join(" · ") || "none"),
    ...(version ? [line("pen", "Version", outdated.length ? `**${plural(outdated.length, "server")}** still on an older version, latest is v${version}` : `every server on v${version}`)] : []),
    ...(game
      ? [line("star", "Game", [`${compact(game.visits)} visits${gameDayAgo && game.visits > gameDayAgo.visits ? ` (+${compact(game.visits - gameDayAgo.visits)} in 24h)` : ""}`, `${game.favorites.toLocaleString("en-US")} favourites`, game.upVotes + game.downVotes ? `${((game.upVotes / (game.upVotes + game.downVotes)) * 100).toFixed(1)}% likes` : ""].filter(Boolean).join(" · "))]
      : []),
    ...(peakRange && allTime ? [line("crown", "Records", `peak in the ${config.label.toLowerCase()} **${peakRange.players.toLocaleString("en-US")}** · highest recorded **${allTime.players.toLocaleString("en-US")}** on ${time(allTime.at, "D")}`)] : []),
  ];

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${icon("grid")} ${GAME_NAME}\nLive public servers, read from Roblox once a minute.`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(details.join("\n")))
    .addMediaGalleryComponents(media("players.png", `${GAME_NAME} players, ${config.label.toLowerCase()}`))
    .addMediaGalleryComponents(media("servers.png", `${GAME_NAME} servers by fill and FPS, capacity and regions`));
  if (servers.length) container.addActionRowComponents(...pickers(servers, range));
  container
    .addActionRowComponents(rangeButtons(range, "overview"))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Updated ${time(Math.max(...servers.map((server) => server.lastSeen), now - 60_000), "R")}${since ? ` · tracking since ${time(since, "D")}` : ""} · locations from RoValra`));
  return { components: [container], files: [new AttachmentBuilder(chart, { name: "players.png" }), new AttachmentBuilder(board, { name: "servers.png" })] };
};

const serverView = async (jobId: string, range: Range): Promise<View> => {
  const server = serverRow(jobId);
  if (!server) return { components: [errorPanel("Server closed", "That server isn't in the public list anymore. It probably shut down.")], files: [] };
  const servers = activeServers();
  const rank = servers.findIndex((entry) => entry.jobId === jobId) + 1;
  const version = latestVersion(servers);
  const series = serverSeries(jobId);
  const chart = await png(serverChart(server, series));
  const players = servers.reduce((sum, entry) => sum + entry.playing, 0);
  const fleetFps = players ? servers.reduce((sum, entry) => sum + entry.fps * entry.playing, 0) / players : 0;
  const fleetPing = players ? servers.reduce((sum, entry) => sum + entry.ping * entry.playing, 0) / players : 0;
  const closed = Date.now() - server.lastSeen > 3 * 60_000;
  const behind = version && server.placeVersion ? version - server.placeVersion : 0;

  const details = [
    line("user", "Players", `**${server.playing} / ${server.maxPlayers}** · ${fill(server)}% full${rank ? ` · ${rank} of ${servers.length} by players` : ""}`),
    line("gears", "Performance", `**${server.fps.toFixed(1)} FPS** · **${server.ping} ms** · network average ${fleetFps.toFixed(1)} FPS, ${Math.round(fleetPing)} ms`),
    line("clock", "Uptime", closed ? `closed ${time(server.lastSeen, "R")}` : `up ${duration(Date.now() - server.firstSeen)}, since ${time(server.firstSeen, "f")}`),
    line("globe", "Location", `${[server.city, server.region, server.country].filter(Boolean).join(", ") || "not reported"}${server.datacenterId ? ` · datacenter \`${server.datacenterId}\`` : ""}`),
    ...(server.placeVersion ? [line("pen", "Version", behind > 0 ? `v${server.placeVersion}, **${plural(behind, "version")} behind** v${version}` : `v${server.placeVersion}, the latest`)] : []),
    line("list", "Job ID", `\`${server.jobId}\``),
  ];

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${icon("globe")} ${place(server)} · ${shortId(server.jobId)}`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(details.join("\n")))
    .addMediaGalleryComponents(media("server.png", `Players, FPS and ping for server ${server.jobId}`));
  if (servers.length) container.addActionRowComponents(...pickers(servers, range, jobId));
  container.addActionRowComponents(
    new ActionRowBuilder<ReturnType<typeof button>>().addComponents(
      button(`servers:range:${range}`, "Back to all servers", ButtonStyle.Secondary, "arrow-left"),
      ...(closed ? [] : [linkButton("Join server", `https://www.roblox.com/games/start?placeId=${GAME_PLACE_ID}&gameInstanceId=${server.jobId}`).setEmoji(emoji("login"))]),
    ),
  );
  container.addSeparatorComponents(divider()).addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Samples every minute, kept for 48 hours · updated ${time(server.lastSeen, "R")}`));
  return { components: [container], files: [new AttachmentBuilder(chart, { name: "server.png" })] };
};

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const heatView = async (range: Range): Promise<View> => {
  const hours = hourlyAverages(Date.now() - 28 * DAY);
  const result = heatmap(hours);
  const image = await png(result.svg);
  const slot = (cell: { day: number; hour: number; players: number }) => `${DAY_NAMES[cell.day]} ${String(cell.hour).padStart(2, "0")}:00 UTC, about **${Math.round(cell.players).toLocaleString("en-US")}** players`;
  const coverage = new Set(hours.map((entry) => `${new Date(entry.at).getUTCDay()}-${new Date(entry.at).getUTCHours()}`)).size;
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${icon("calendar")} ${GAME_NAME} · week map\nAverage players for each hour of the week over the last 4 weeks.`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          ...(result.busiest ? [line("crown", "Busiest", slot(result.busiest))] : []),
          ...(result.quietest ? [line("minus", "Quietest", slot(result.quietest))] : []),
          line("pie", "Coverage", `${coverage} of 168 hours have data${coverage < 168 ? ", empty cells fill in as the bot keeps collecting" : ""}`),
        ].join("\n"),
      ),
    )
    .addMediaGalleryComponents(media("week.png", `${GAME_NAME} average players by weekday and hour`))
    .addActionRowComponents(rangeButtons(range, "heat"));
  return { components: [container], files: [new AttachmentBuilder(image, { name: "week.png" })] };
};

export const runServers = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  if (!(await ensureAccess(interaction, "servers"))) return;
  await interaction.deferReply();
  const query = interaction.options.getString("server")?.replace(/^#/, "").trim().toLowerCase();
  if (query) {
    const matches = serverByPrefix(query);
    if (matches.length !== 1) {
      const message = matches.length ? `\`${query}\` matches ${matches.length} servers. Add a few more characters.` : `No live server matches \`${query}\`.`;
      await interaction.editReply({ flags: v2, components: [errorPanel("Server not found", message)] });
      return;
    }
    const view = await serverView(matches[0]!.jobId, "24h");
    await interaction.editReply({ flags: v2, ...view });
    return;
  }
  await interaction.editReply({ flags: v2, ...(await overview("24h")) });
};

const update = async (interaction: ButtonInteraction | StringSelectMenuInteraction, view: Promise<View>): Promise<void> => {
  await interaction.deferUpdate();
  const built = await view;
  await interaction.editReply({ flags: v2, components: built.components, files: built.files, attachments: [] });
};

export const handleServersButton = async (interaction: ButtonInteraction): Promise<void> => {
  if (!(await ensureAccess(interaction, "servers"))) return;
  const [, action, value] = interaction.customId.split(":");
  const range: Range = isRange(value) ? value : "24h";
  if (action === "heat") await update(interaction, heatView(range));
  else await update(interaction, overview(range));
};

export const handleServersSelect = async (interaction: StringSelectMenuInteraction): Promise<void> => {
  if (!(await ensureAccess(interaction, "servers"))) return;
  const value = interaction.customId.split(":")[2];
  await update(interaction, serverView(interaction.values[0] ?? "", isRange(value) ? value : "24h"));
};
