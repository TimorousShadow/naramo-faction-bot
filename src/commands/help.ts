// TimorousShadow
import type { ChatInputCommandInteraction } from "discord.js";
import { canUse, hasAccess } from "../access.js";
import { MAIN_GUILD_ID } from "../config.js";
import { COLORED, LOGOS } from "../icon-set.js";
import { commandsFor } from "../registry.js";
import { errorPanel, icon, logo, panel, v2 } from "../ui.js";

const DESCRIPTIONS: Record<string, string> = {
  banlist: "Upload a CSV of Discord IDs and ban them all in this server after you confirm. Administrators only.",
  globalban: "Ban a user from ANRO, NES and NMP and record it as a global ban.",
  globalunban: "Lift a recorded global ban in every server.",
  gbaninfo: "A user's global ban status and their ban in each server.",
  lookup: "A user across the Naramo servers: account age, Roblox account, roles and bans.",
  safety: "Every safety checker on a Discord user or Roblox account, with full details per flag.",
  servers: "Live game servers with player, FPS and ping graphs, a week map and a page per server.",
  status: "The bot's access and permissions in each server.",
};

const PROVIDERS: Record<(typeof LOGOS)[number], string> = {
  rayward: "Rayward, which carries Rotector, ServerSweep, Okappiki, RAB and TASE",
  rotector: "Rotector (via Rayward)",
  serversweep: "ServerSweep (via Rayward)",
  okappiki: "Okappiki (via Rayward)",
  rab: "RAB (via Rayward)",
  tase: "TASE (via Rayward)",
  robloxwatcher: "Roblox Watcher and Exploit Watcher",
  simmer: "Simmer",
  xtracker: "X Tracker",
  catwatcher: "Cat Watcher",
};

export const runHelp = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const guildId = interaction.guildId ?? "";
  const registered = commandsFor(guildId).filter((command) => command.name !== "help");
  const usable: string[] = [];
  for (const command of registered) if (await canUse(interaction, command.name)) usable.push(command.name);
  const gated = guildId === MAIN_GUILD_ID ? await hasAccess(interaction.client, interaction.user.id) : usable.length > 0;
  if (!gated) {
    await interaction.reply({ flags: v2, components: [errorPanel("No access", "You can't use any of this bot's commands in this server.")] });
    return;
  }
  const commands = usable.map((name) => `**/${name}** ${DESCRIPTIONS[name] ?? ""}`);
  const icons = COLORED.map(([base, color, , meaning]) => `${icon(`${base}:${color}` as const)} ${meaning}`);
  const providers = LOGOS.filter((name) => name !== "rayward").map((name) => `${logo(name)} ${PROVIDERS[name]}`);
  await interaction.reply({
    flags: v2,
    allowedMentions: { parse: [] },
    components: [
      panel({
        icon: "info",
        title: "Help",
        body: [`Commands you can use in **${interaction.guild?.name ?? "this server"}**.`, "", ...commands],
        details: ["**Status icons**", ...icons, "", "**Safety providers**", ...providers],
        footer: "Results from safety providers come from third-party services. Check the evidence before acting.",
      }),
    ],
  });
};
