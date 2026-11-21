// TimorousShadow
import { execFileSync } from "node:child_process";
import { PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction, type Guild } from "discord.js";
import { ensureAccess } from "../access.js";
import { GLOBAL_BAN_LOG_CHANNEL_ID, MAIN_GUILD_ID, SERVERS } from "../config.js";
import { robloxConfigured } from "../roblox.js";
import { globalBanCounts } from "../store.js";
import { icon, line, panel, time, v2 } from "../ui.js";

const startedAt = Date.now();
const SAFETY_KEYS = [
  ["RAYWARD_API_KEY", "Rayward"],
  ["ROBLOX_WATCHER_API_KEY", "Roblox Watcher"],
  ["EXPLOIT_WATCHER_API_KEY", "Exploit Watcher"],
  ["SIMMER_API_KEY", "Simmer"],
  ["XTRACKER_API_KEY", "X Tracker"],
  ["CATWATCHER_API_KEY", "Cat Watcher"],
] as const;
const version = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "unknown";
  }
})();

const NEEDED = [
  [PermissionFlagsBits.BanMembers, "Ban Members"],
  [PermissionFlagsBits.ManageGuild, "Manage Server"],
  [PermissionFlagsBits.ViewAuditLog, "View Audit Log"],
] as const;

export const statusCommand = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Check the bot's access and permissions in each Naramo server")
  .setDMPermission(false);

const serverCheck = (name: string, guild: Guild | undefined): string => {
  if (!guild) return `${icon("minus:grey")} **${name}**: bot not added yet`;
  const me = guild.members.me;
  if (!me) return `${icon("alert-triangle")} **${name}**: couldn't read the bot's member`;
  const missing = NEEDED.filter(([flag]) => !me.permissions.has(flag)).map(([, label]) => label);
  const above = guild.roles.cache.filter((role) => role.position > me.roles.highest.position).size;
  const problems = [...(missing.length ? [`missing ${missing.join(", ")}`] : []), ...(above ? [`${above} role${above === 1 ? "" : "s"} above the bot can't be banned`] : [])];
  return `${icon(problems.length ? "alert-circle:amber" : "check:green")} **${name}**: ${problems.length ? problems.join("; ") : "ready"}\n-# ${guild.memberCount.toLocaleString("en-US")} members, bot role ${me.roles.highest.name}`;
};

export const runStatus = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  if (!(await ensureAccess(interaction, "status"))) return;
  await interaction.deferReply();
  const client = interaction.client;
  const main = client.guilds.cache.get(MAIN_GUILD_ID);
  await Promise.all([main, ...SERVERS.map((server) => client.guilds.cache.get(server.id))].map((guild) => guild?.roles.fetch().catch(() => null)));
  const log = await client.channels.fetch(GLOBAL_BAN_LOG_CHANNEL_ID).catch(() => null);
  const counts = globalBanCounts();
  const ready = SERVERS.filter((server) => client.guilds.cache.has(server.id)).length;

  await interaction.editReply({
    flags: v2,
    components: [
      panel({
        icon: "pie",
        title: "Bot status",
        body: `In ${ready} of ${SERVERS.length} Naramo servers.`,
        details: [
          serverCheck("Faction Management", main),
          ...SERVERS.map((server) => serverCheck(server.name, client.guilds.cache.get(server.id))),
          "",
          line("archive", "Global bans", `${counts.active} active, ${counts.total} on record`),
          line("text-bubble", "Ban log", log?.isSendable() ? `<#${GLOBAL_BAN_LOG_CHANNEL_ID}>` : "channel not reachable"),
          line("link", "Bloxlink", robloxConfigured() ? "configured" : "not configured"),
          line("search", "Safety checkers", `${SAFETY_KEYS.filter(([key]) => process.env[key]).map(([, name]) => name).join(", ") || "none configured"}`),
          line("clock", "Up since", `${time(startedAt, "R")}, ping ${client.ws.ping} ms, version \`${version}\``),
        ],
      }),
    ],
  });
};
