// TimorousShadow
import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  escapeMarkdown,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { ensureAccess } from "../access.js";
import { MAIN_GUILD_ID } from "../config.js";
import { robloxForDiscord } from "../roblox.js";
import { resolveRobloxUsername, runSafetyChecks, type CheckResult, type SafetyReport, type WatcherData, type WatcherGuild } from "../safety.js";
import { activeGlobalBan } from "../store.js";
import { button, emoji, errorPanel, icon, linkButton, logo, privateV2, reasonModal, v2 } from "../ui.js";
import type { LogoName } from "../icon-set.js";

const TTL_MS = 30 * 60 * 1000;
const SERVERS_PER_PAGE = 2;
const BLOCK_LIMIT = 1700;

interface Subject {
  discord: { id: string; username: string; avatar: string; created: number } | null;
  roblox: { id: string; name: string; avatar: string | null } | null;
  note: string;
}

interface View extends Subject {
  canGlobalBan: boolean;
  report: SafetyReport;
  globalBan: boolean;
  servers: { source: string; guild: WatcherGuild }[];
  details: { title: string; lines: string[] }[];
}

const views = new Map<string, View>();

export const safetyCommand = new SlashCommandBuilder()
  .setName("safety")
  .setDescription("Run every safety checker on a Discord user or Roblox account")
  .setDMPermission(false)
  .addUserOption((option) => option.setName("user").setDescription("Discord user, or paste their ID"))
  .addStringOption((option) => option.setName("roblox").setDescription("Roblox username or user ID").setMaxLength(40));

const code = (value: number | string): string => `\`${typeof value === "number" ? Math.round(value * 100) / 100 : value}\``;
const ts = (value: string | null | undefined, style: "F" | "R"): string | null => {
  const ms = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(ms) ? null : `<t:${Math.floor(ms / 1000)}:${style}>`;
};
const plural = (count: number, word: string, many = `${word}s`): string => `${code(count)} ${count === 1 ? word : many}`;
const cleanName = (name: string): string =>
  escapeMarkdown(name.replace(/(?:https?:\/\/)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/\S+/gi, "[invite]")).slice(0, 80).trim() || "Unknown server";
const titleCase = (key: string): string => key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase()).trim();

const STATE_ICON = { flagged: "alert-triangle:red", pending: "clock:amber", clear: "check:green", error: "alert-circle:amber", skipped: "minus:grey" } as const;

const PROVIDER_LOGOS: [string, LogoName][] = [
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

const ACTIVITY: [string, (count: number) => string][] = [
  ["messages", (n) => `Sent ${plural(n, "message")}`],
  ["slashCommands", (n) => `Ran ${plural(n, "slash command")}`],
  ["typing", (n) => `Typed ${plural(n, "time")}`],
  ["reactions", (n) => `Reacted ${plural(n, "time")}`],
  ["vcJoins", (n) => `Joined VC ${plural(n, "time")}`],
  ["boosts", (n) => `Boosted ${plural(n, "time")}`],
  ["nsfwRequests", (n) => `Requested NSFW content ${plural(n, "time")} using an NSFW bot`],
  ["rr34Requests", (n) => `Made ${plural(n, "rule 34 request")}`],
  ["erpInteractions", (n) => `Had ${plural(n, "ERP interaction")}`],
  ["scriptRequests", (n) => `Asked a bot for scripts ${plural(n, "time")}`],
  ["bypassBotUsages", (n) => `Used a key bypass bot ${plural(n, "time")}`],
];

const activityLines = (activity: Record<string, number> | null | undefined): string[] =>
  ACTIVITY.flatMap(([key, label]) => ((activity?.[key] ?? 0) > 0 ? [label(activity![key]!)] : []));

const totals = (data: WatcherData): string[] => {
  const sum: Record<string, number> = {};
  for (const guild of data.guilds) for (const [key, value] of Object.entries(guild.activity ?? {})) sum[key] = (sum[key] ?? 0) + (typeof value === "number" ? value : 0);
  const staff = data.guilds.filter((guild) => guild.membership?.staff === true).length;
  const owner = data.guilds.filter((guild) => guild.membership?.owner === true).length;
  return [
    ...activityLines(sum),
    ...(owner ? [`Owner of ${plural(owner, "server")}`] : []),
    ...(staff ? [`Staff in ${plural(staff, "server")}`] : []),
  ];
};

const providerLogo = (name: string): string => {
  const match = PROVIDER_LOGOS.find(([prefix]) => name.startsWith(prefix));
  return match ? `${logo(match[1])} ` : "";
};

const checkLine = (check: CheckResult): string => `${icon(STATE_ICON[check.state])} ${providerLogo(check.name)}**${check.name}** ${check.text}`;

const serverBlock = (source: string, guild: WatcherGuild): string => {
  const joins = guild.guildJoins ?? [];
  const leaves = guild.guildLeaves ?? [];
  const latest = (values: string[]): number => Math.max(...values.map((value) => Date.parse(value)).filter((value) => !Number.isNaN(value)), 0);
  const left = leaves.length > 0 && latest(leaves) >= latest(joins);
  const inServer = left ? "No" : joins.length || guild.estimatedJoin ? "Yes" : "Unknown";
  const joinDates = joins.slice(0, 3).map((value) => ts(value, "F")).filter(Boolean).join(", ");
  const joined = joins.length
    ? `Joined the server ${plural(joins.length, "time")}: ${joinDates}${joins.length > 3 ? ` and ${joins.length - 3} more` : ""}`
    : `Joined the server: ${ts(guild.estimatedJoin, "F") ? `estimate ${ts(guild.estimatedJoin, "F")}` : code("Unknown")}`;
  const seen = [
    ["First seen", ts(guild.firstSeen, "R")],
    ["Last seen", ts(guild.lastSeen, "R")],
    ["Last activity", ts(guild.lastActivity, "R")],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join(" · ");
  const membership = guild.membership ?? {};
  const permissions = (membership.allTimePermissions ?? []).slice(0, 8).map((permission) => code(permission)).join(", ");
  const extras = Object.entries(membership)
    .filter(([key, value]) => value === true && key !== "owner" && key !== "staff")
    .map(([key]) => titleCase(key));
  const notableRoles = (guild.roles ?? []).filter((role) => role.type).slice(0, 4).map((role) => `${code(escapeMarkdown(role.name).slice(0, 40))} ${role.type}`);
  const memberLines = [
    ...(membership.owner === true ? [`${icon("crown:amber")} Owner`] : []),
    ...(membership.staff === true ? [`${icon("gears:blurple")} Staff`] : []),
    ...(permissions ? [`└ Permissions: ${permissions}`] : []),
    ...(extras.length ? [`${icon("star")} ${extras.join(", ")}`] : []),
    ...((guild.roles ?? []).length ? [`${icon("list")} ${plural(guild.roles!.length, "role")}${notableRoles.length ? `: ${notableRoles.join(", ")}` : ""}`] : []),
  ];
  const activity = activityLines(guild.activity);
  const types = (guild.guildTypes ?? []).map((type) => type.name).filter(Boolean).map((name) => code(name!)).join(", ");
  const flags = (guild.guildFlags ?? []).map((flag) => code(flag)).join(", ");

  const text = [
    `### ${icon(left ? "logout:red" : "login:green")} ${cleanName(guild.name)} (${code(guild.id)})`,
    `-# ${source}`,
    joined,
    ...(leaves.length ? [`Left ${plural(leaves.length, "time")}, last ${ts(leaves.at(-1), "R") ?? code("Unknown")}`] : []),
    ...(seen ? [seen] : []),
    `Currently in the server: ${code(inServer)}`,
    `Total activity score: ${code(guild.score ?? 0)}`,
    ...(activity.length ? ["**Activity**", activity.join(" · ")] : []),
    ...(memberLines.length ? ["**Membership**", ...memberLines] : []),
    "**Server information**",
    `Server type: ${types || code("Unknown")}`,
    ...(flags ? [`Server flags: ${flags}`] : []),
  ].join("\n");
  return text.length > BLOCK_LIMIT ? `${text.slice(0, BLOCK_LIMIT - 2)}…` : text;
};

const DETAIL_BUDGET = 3200;

const detailPages = (checks: CheckResult[]): { title: string; lines: string[] }[] => {
  const pages: { title: string; lines: string[] }[] = [];
  for (const check of checks) {
    if (!check.details?.length || (check.state !== "flagged" && check.state !== "pending")) continue;
    const header = `### ${icon(STATE_ICON[check.state])} ${providerLogo(check.name)}${check.name}`;
    let current: string[] = [header];
    let size = header.length;
    let part = 1;
    for (const line of check.details) {
      if (size + line.length + 1 > DETAIL_BUDGET && current.length > 1) {
        pages.push({ title: part === 1 ? check.name : `${check.name} (${part})`, lines: current });
        part += 1;
        current = [`### ${icon(STATE_ICON[check.state])} ${providerLogo(check.name)}${check.name} (continued)`];
        size = current[0]!.length;
      }
      current.push(line);
      size += line.length + 1;
    }
    pages.push({ title: part === 1 ? check.name : `${check.name} (${part})`, lines: current });
  }
  return pages;
};

const serverPageCount = (view: View): number => Math.ceil(view.servers.length / SERVERS_PER_PAGE);

const pageCount = (view: View): number => 1 + view.details.length + serverPageCount(view);

const sections = (view: View): { label: string; page: number }[] => {
  const list = [{ label: "Overview", page: 0 }, ...view.details.map((detail, index) => ({ label: `Details: ${detail.title}`, page: 1 + index }))];
  const first = 1 + view.details.length;
  for (let index = 0; index < serverPageCount(view); index += 1) {
    const from = index * SERVERS_PER_PAGE + 1;
    const to = Math.min((index + 1) * SERVERS_PER_PAGE, view.servers.length);
    list.push({ label: `Servers ${from}${to > from ? `-${to}` : ""}: ${view.servers[from - 1]!.source}`, page: first + index });
  }
  return list.slice(0, 25);
};

const overview = (view: View, container: ContainerBuilder): void => {
  const { report } = view;
  const heading = view.discord
    ? [`### @${escapeMarkdown(view.discord.username)} (${code(view.discord.id)})`, "**Discord information**", `<@${view.discord.id}>`, `Account created: <t:${Math.floor(view.discord.created / 1000)}:F>`]
    : [`### ${escapeMarkdown(view.roblox!.name)} (${code(view.roblox!.id)})`, "**Roblox account only**", "No Discord account was given, so the Discord checks were skipped."];
  if (view.globalBan) heading.push(`${icon("globe:red")} Globally banned`);
  const thumbnail = view.discord?.avatar ?? view.roblox?.avatar;
  const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(heading.join("\n")));
  if (thumbnail) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));
  else section.setButtonAccessory(linkButton("Discord profile", `https://discord.com/users/${view.discord?.id ?? ""}`));
  container.addSectionComponents(section);
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  const connected = view.roblox
    ? [
        `**[${escapeMarkdown(view.roblox.name)}](https://www.roblox.com/users/${view.roblox.id}/profile)** (${code(view.roblox.id)})`,
        ...report.linkedDiscord
          .slice(0, 6)
          .map((account) => `└ ${icon(account.flagged ? "alert-circle:red" : "user")} <@${account.id}> (${code(account.id)})${account.sources.length ? ` · Source: ${account.sources.join(" & ")}` : ""}`),
      ]
    : ["No Roblox account found."];
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(["### Connected accounts", ...connected, ...(view.note ? [`-# ${view.note}`] : [])].join("\n")));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  const flagged = report.checks.filter((check) => check.state === "flagged").length;
  const ran = report.checks.filter((check) => check.state !== "skipped" && check.state !== "error").length;
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `### Safety checks`,
        `Flagged by ${code(flagged)} of ${code(ran)} checks`,
        ...report.checks.map(checkLine),
        ...(view.details.length ? [`-# Full details for each flag are on pages 2 to ${view.details.length + 1}. Use the menu below to jump.`] : []),
      ].join("\n"),
    ),
  );

  const activity = [
    ["Roblox Watcher", report.robloxWatcher],
    ["Exploit Watcher", report.exploitWatcher],
  ] as const;
  const blocks = activity.flatMap(([name, data]) =>
    data && data.guilds.length
      ? [[`**${name} total activity score (across all servers):** ${code(data.totalScore)}`, `- **Detected in ${plural(data.guilds.length, "server")}**`, ...totals(data).map((line) => `  - ${line}`)].join("\n")]
      : [],
  );
  if (blocks.length) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(["### Activity", ...blocks].join("\n\n")));
  }
};

const render = (token: string, view: View, page: number): ContainerBuilder => {
  const total = pageCount(view);
  const current = Math.min(Math.max(page, 0), total - 1);
  const container = new ContainerBuilder();
  if (current === 0) overview(view, container);
  else if (current <= view.details.length) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(view.details[current - 1]!.lines.join("\n")));
  } else {
    const serverPage = current - 1 - view.details.length;
    const slice = view.servers.slice(serverPage * SERVERS_PER_PAGE, (serverPage + 1) * SERVERS_PER_PAGE);
    slice.forEach((entry, index) => {
      if (index > 0) container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(serverBlock(entry.source, entry.guild)));
    });
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Page ${current + 1}/${total}${view.servers.length ? ` · ${plural(view.servers.length, "flagged server")}` : ""} · Results come from third-party services, check the evidence before acting.`),
  );
  if (total > 1) {
    const nav = (target: number, name: "arrow-left" | "chevron-left" | "chevron-right" | "arrow-right", disabled: boolean): ButtonBuilder =>
      new ButtonBuilder().setCustomId(`safety:page:${token}:${target}:${name}`).setStyle(ButtonStyle.Secondary).setEmoji(emoji(name)).setDisabled(disabled);
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        nav(0, "arrow-left", current === 0),
        nav(current - 1, "chevron-left", current === 0),
        nav(current + 1, "chevron-right", current === total - 1),
        nav(total - 1, "arrow-right", current === total - 1),
      ),
    );
  }
  const jump = sections(view);
  if (jump.length > 2) {
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`safety:jump:${token}`)
          .setPlaceholder("Jump to a section")
          .addOptions(jump.map((entry) => ({ label: entry.label.slice(0, 100), value: String(entry.page), default: entry.page === current }))),
      ),
    );
  }
  const actions: ButtonBuilder[] = [
    ...(view.discord && !view.globalBan && view.canGlobalBan ? [button(`safety:gban:${view.discord.id}`, "Global ban", ButtonStyle.Danger, "user-cross:red")] : []),
    ...(view.roblox ? [linkButton("Roblox profile", `https://www.roblox.com/users/${view.roblox.id}/profile`)] : []),
  ];
  if (actions.length) container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(actions));
  return container;
};

const robloxHeadshot = async (id: string): Promise<string | null> => {
  try {
    const response = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png`, { signal: AbortSignal.timeout(8000) });
    const data = (await response.json()) as { data?: { imageUrl?: string }[] };
    return data.data?.[0]?.imageUrl ?? null;
  } catch {
    return null;
  }
};

const report = async (interaction: ChatInputCommandInteraction | ButtonInteraction, discordId: string | null, robloxInput: string | null): Promise<void> => {
  await interaction.deferReply();
  const subject: Subject = { discord: null, roblox: null, note: "" };

  if (discordId) {
    const user = await interaction.client.users.fetch(discordId).catch(() => null);
    if (!user) {
      await interaction.editReply({ flags: v2, components: [errorPanel("Discord user not found", `No Discord account has the ID \`${discordId}\`.`)] });
      return;
    }
    subject.discord = { id: user.id, username: user.username, avatar: user.displayAvatarURL({ size: 256, extension: "png" }), created: user.createdTimestamp };
  }
  if (robloxInput) {
    const found = await resolveRobloxUsername(robloxInput).catch(() => null);
    if (!found) {
      await interaction.editReply({ flags: v2, components: [errorPanel("Roblox account not found", `No Roblox account matches \`${robloxInput}\`.`)] });
      return;
    }
    subject.roblox = { ...found, avatar: null };
  } else if (discordId) {
    const linked = await robloxForDiscord(discordId);
    if (linked.status === "linked") subject.roblox = { id: linked.account.id, name: linked.account.name, avatar: null };
    else subject.note = linked.status === "unlinked" ? "No linked Roblox account found, so the Roblox checks were skipped." : "Bloxlink didn't answer, so the Roblox checks were skipped.";
  }
  if (subject.roblox && !subject.discord) subject.roblox.avatar = await robloxHeadshot(subject.roblox.id);

  const result = await runSafetyChecks(subject.discord?.id ?? null, subject.roblox?.id ?? null);
  const byScore = (a: WatcherGuild, b: WatcherGuild) => (b.score ?? 0) - (a.score ?? 0);
  const view: View = {
    ...subject,
    canGlobalBan: interaction.guildId === MAIN_GUILD_ID,
    report: result,
    globalBan: subject.discord ? Boolean(activeGlobalBan(subject.discord.id)) : false,
    details: detailPages(result.checks),
    servers: [
      ...(result.robloxWatcher?.guilds ?? []).sort(byScore).map((guild) => ({ source: "Roblox Watcher", guild })),
      ...(result.exploitWatcher?.guilds ?? []).sort(byScore).map((guild) => ({ source: "Exploit Watcher", guild })),
    ],
  };
  const token = randomUUID().slice(0, 12);
  views.set(token, view);
  setTimeout(() => views.delete(token), TTL_MS).unref();
  await interaction.editReply({ flags: v2, components: [render(token, view, 0)], allowedMentions: { parse: [] } });
};

export const runSafety = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  if (!(await ensureAccess(interaction, "safety"))) return;
  const user = interaction.options.getUser("user");
  const robloxInput = interaction.options.getString("roblox")?.trim() || null;
  if (!user && !robloxInput) {
    await interaction.reply({ flags: v2, components: [errorPanel("Nothing to check", "Give a Discord user, a Roblox username or ID, or both.")] });
    return;
  }
  await report(interaction, user?.id ?? null, robloxInput);
};

export const handleSafetyButton = async (interaction: ButtonInteraction): Promise<void> => {
  const [, action, value, page] = interaction.customId.split(":");
  if (action === "page") {
    const view = value ? views.get(value) : undefined;
    if (!view) {
      await interaction.reply({ flags: privateV2, components: [errorPanel("This report expired", "Reports stay open for 30 minutes. Run /safety again for fresh results.")] });
      return;
    }
    if (!(await ensureAccess(interaction, "safety"))) return;
    await interaction.update({ components: [render(value!, view, Number(page))], allowedMentions: { parse: [] } });
    return;
  }
  if (action === "gban") {
    if (!(await ensureAccess(interaction, "globalban"))) return;
    await interaction.showModal(reasonModal(`globalban-reason:${value}`, "Global ban reason", "Shown in each server's audit log and in the ban log"));
    return;
  }
  if (!(await ensureAccess(interaction, "safety"))) return;
  await report(interaction, value ?? null, null);
};

export const handleSafetySelect = async (interaction: StringSelectMenuInteraction): Promise<void> => {
  const token = interaction.customId.split(":")[2];
  const view = token ? views.get(token) : undefined;
  if (!view) {
    await interaction.reply({ flags: privateV2, components: [errorPanel("This report expired", "Reports stay open for 30 minutes. Run /safety again for fresh results.")] });
    return;
  }
  if (!(await ensureAccess(interaction, "safety"))) return;
  await interaction.update({ components: [render(token!, view, Number(interaction.values[0] ?? 0))], allowedMentions: { parse: [] } });
};
