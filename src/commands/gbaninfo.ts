// TimorousShadow
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { ensureAccess } from "../access.js";
import { banLine, checkBans, userLabel } from "../network.js";
import { globalBanHistory } from "../store.js";
import { line, panel, privateV2, time } from "../ui.js";

export const gbaninfoCommand = new SlashCommandBuilder()
  .setName("gbaninfo")
  .setDescription("Show a user's global ban status and their ban in each server")
  .setDMPermission(false)
  .addUserOption((option) => option.setName("user").setDescription("User to check, or paste their ID").setRequired(true));

export const runGbaninfo = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  if (!(await ensureAccess(interaction, "gbaninfo"))) return;
  await interaction.deferReply({ flags: privateV2 });
  const targetId = interaction.options.getUser("user", true).id;
  const [label, servers] = await Promise.all([userLabel(interaction.client, targetId), checkBans(interaction.client, targetId)]);
  const history = globalBanHistory(targetId);
  const latest = history[0];

  const status = !latest
    ? "Never globally banned."
    : latest.liftedAt === null
      ? "**Globally banned.**"
      : `Not globally banned. The last global ban was lifted ${time(latest.liftedAt, "R")}.`;

  const record = latest
    ? [
        line("crown", "Banned by", `<@${latest.issuedBy}> ${time(latest.issuedAt, "f")}`),
        line("text-bubble", "Reason", latest.reason),
        ...(latest.liftedAt !== null
          ? [line("unlock", "Lifted by", `<@${latest.liftedBy}> ${time(latest.liftedAt, "f")}`), line("paper", "Unban reason", latest.liftReason ?? "None given")]
          : []),
      ]
    : [];

  await interaction.editReply({
    components: [
      panel({
        icon: latest && latest.liftedAt === null ? "user-cross" : "search",
        title: "Global ban status",
        body: [`<@${targetId}>`, status],
        details: [line("user", "User", label.text), ...record, "", line("home", "Servers", ""), ...servers.map(banLine)],
        ...(history.length > 1 ? { footer: `${history.length} global bans on record for this user` } : {}),
      }),
    ],
    allowedMentions: { parse: [] },
  });
};
