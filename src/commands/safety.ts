// TimorousShadow
import { SlashCommandBuilder, type ButtonInteraction, type ChatInputCommandInteraction } from "discord.js";
import { ensureAccess } from "../access.js";
import { robloxForDiscord } from "../roblox.js";
import { resolveRobloxUsername, runSafetyChecks, type CheckResult } from "../safety.js";
import { activeGlobalBan } from "../store.js";
import { errorPanel, icon, line, linkButton, panel, v2 } from "../ui.js";

export const safetyCommand = new SlashCommandBuilder()
  .setName("safety")
  .setDescription("Run every safety checker on a Discord user or Roblox account")
  .setDMPermission(false)
  .addUserOption((option) => option.setName("user").setDescription("Discord user, or paste their ID"))
  .addStringOption((option) => option.setName("roblox").setDescription("Roblox username or user ID").setMaxLength(40));

const STATE_ICON = { flagged: "alert-triangle", pending: "clock", clear: "check", error: "alert-circle", skipped: "minus" } as const;

const checkLine = (check: CheckResult): string => `${icon(STATE_ICON[check.state])} **${check.name}** ${check.text}`;

const report = async (interaction: ChatInputCommandInteraction | ButtonInteraction, discordId: string | null, robloxInput: string | null): Promise<void> => {
  await interaction.deferReply();

  let roblox: { id: string; name: string } | null = null;
  let robloxNote = "";
  if (robloxInput) {
    roblox = await resolveRobloxUsername(robloxInput).catch(() => null);
    if (!roblox) {
      await interaction.editReply({ flags: v2, components: [errorPanel("Roblox account not found", `No Roblox account matches \`${robloxInput}\`.`)] });
      return;
    }
  } else if (discordId) {
    const linked = await robloxForDiscord(discordId);
    if (linked.status === "linked") roblox = { id: linked.account.id, name: linked.account.name };
    else robloxNote = linked.status === "unlinked" ? "No Roblox account linked in Bloxlink, so the Roblox checks were skipped." : "Bloxlink didn't answer, so the Roblox checks were skipped.";
  }

  const { checks, linkedDiscord } = await runSafetyChecks(discordId, roblox?.id ?? null);
  const flagged = checks.filter((check) => check.state === "flagged");
  const ran = checks.filter((check) => check.state !== "skipped" && check.state !== "error").length;
  const global = discordId ? activeGlobalBan(discordId) : undefined;
  const others = linkedDiscord.filter((account) => account.id !== discordId);

  const subject = [
    ...(discordId ? [line("user", "Discord", `<@${discordId}> \`${discordId}\``)] : []),
    ...(roblox ? [line("link", "Roblox", `[${roblox.name}](https://www.roblox.com/users/${roblox.id}/profile) \`${roblox.id}\``)] : []),
    ...(global ? [line("globe", "Global ban", "active")] : []),
  ];

  await interaction.editReply({
    flags: v2,
    allowedMentions: { parse: [] },
    components: [
      panel({
        icon: flagged.length ? "alert-triangle" : "check",
        title: flagged.length ? `Flagged by ${flagged.length} of ${ran} checks` : `Clean on ${ran} checks`,
        body: [...subject, ...(robloxNote ? [`-# ${robloxNote}`] : [])],
        details: [
          ...checks.map(checkLine),
          ...(others.length
            ? ["", line("user", "Other Discord accounts on this Roblox account", ""), ...others.slice(0, 8).map((account) => `- <@${account.id}> \`${account.id}\`${account.flagged ? " flagged" : ""}`)]
            : []),
        ],
        footer: "Results come from third-party services. Check the evidence before acting on them.",
        ...(roblox ? { buttons: [linkButton("Roblox profile", `https://www.roblox.com/users/${roblox.id}/profile`)] } : {}),
      }),
    ],
  });
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
  if (!(await ensureAccess(interaction, "safety"))) return;
  await report(interaction, interaction.customId.split(":")[2] ?? null, null);
};
