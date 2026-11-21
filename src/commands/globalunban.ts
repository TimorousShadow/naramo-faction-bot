// TimorousShadow
import {
  ButtonStyle,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { ensureAccess } from "../access.js";
import { SERVERS, type ServerEntry } from "../config.js";
import { checkBans, failureText, isUnknownBan, postLog, userLabel } from "../network.js";
import { PendingStore } from "../pending.js";
import { activeGlobalBan, liftGlobalBan } from "../store.js";
import { button, errorPanel, line, panel, privateV2, reasonModal, time, v2 } from "../ui.js";

type Outcome = { server: ServerEntry; status: "lifted" | "clear" | "failed" | "missing"; detail?: string };

const pending = new PendingStore<{ targetId: string; reason: string; banId: number }>(5 * 60 * 1000);

export const globalunbanCommand = new SlashCommandBuilder()
  .setName("globalunban")
  .setDescription("Lift a global ban in every Naramo server")
  .setDMPermission(false)
  .addUserOption((option) => option.setName("user").setDescription("User to unban, or paste their ID").setRequired(true))
  .addStringOption((option) => option.setName("reason").setDescription("Leave empty to type it in a form").setMinLength(3).setMaxLength(400));

const describe = (outcome: Outcome): string => {
  if (outcome.status === "lifted") return `- ${outcome.server.name}: unbanned`;
  if (outcome.status === "clear") return `- ${outcome.server.name}: wasn't banned`;
  if (outcome.status === "missing") return `- ${outcome.server.name}: skipped, bot not added yet`;
  return `- ${outcome.server.name}: failed (${outcome.detail ?? "unknown error"})`;
};

const confirm = async (interaction: ChatInputCommandInteraction | ModalSubmitInteraction, targetId: string, reason: string): Promise<void> => {
  const ban = activeGlobalBan(targetId);
  if (!ban) {
    await interaction.deferReply();
    const local = (await checkBans(interaction.client, targetId)).filter((entry) => entry.state === "banned").map((entry) => entry.server.name);
    await interaction.editReply({
    flags: v2,
      components: [
        errorPanel(
          "No active global ban",
          `<@${targetId}> isn't on the global ban list.${local.length ? ` They're still banned in ${local.join(", ")}, but those bans weren't made with /globalban, so this command leaves them alone.` : ""}`,
        ),
      ],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const label = await userLabel(interaction.client, targetId);
  const { token, expiresAt } = pending.create(interaction.user.id, { targetId, reason, banId: ban.id });
  await interaction.reply({
    components: [
      panel({
        icon: "unlock",
        title: "Lift global ban",
        body: `<@${targetId}> will be unbanned from every Naramo server the bot is in.`,
        details: [
          line("user", "User", label.text),
          line("crown", "Banned by", `<@${ban.issuedBy}> ${time(ban.issuedAt, "R")}`),
          line("paper", "Ban reason", ban.reason),
          line("text-bubble", "Unban reason", reason),
        ],
        buttons: [
          button(`globalunban:confirm:${token}`, "Lift everywhere", ButtonStyle.Primary, "unlock"),
          button(`globalunban:cancel:${token}`, "Cancel", ButtonStyle.Secondary, "cross"),
        ],
        footer: `Nothing happens until you confirm. This expires ${time(expiresAt, "R")}.`,
      }),
    ],
    flags: v2,
    allowedMentions: { parse: [] },
  });
};

export const runGlobalunban = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  if (!(await ensureAccess(interaction, "globalunban"))) return;
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason")?.trim();
  if (!reason) {
    await interaction.showModal(reasonModal(`globalunban-reason:${target.id}`, "Unban reason", "Why the global ban is being lifted"));
    return;
  }
  await confirm(interaction, target.id, reason);
};

export const handleGlobalunbanModal = async (interaction: ModalSubmitInteraction): Promise<void> => {
  if (!(await ensureAccess(interaction, "globalunban"))) return;
  await confirm(interaction, interaction.customId.split(":")[1] ?? "", interaction.fields.getTextInputValue("reason").trim());
};

export const handleGlobalunbanButton = async (interaction: ButtonInteraction): Promise<void> => {
  const [, action, token] = interaction.customId.split(":");
  const taken = pending.take(token, interaction.user.id);
  if (taken.status === "expired") {
    await interaction.update({ components: [errorPanel("This confirmation expired", "Nothing changed. Run /globalunban again.")] });
    return;
  }
  if (taken.status === "other-user") {
    await interaction.reply({ components: [errorPanel("Not your confirmation", `Only <@${taken.userId}> can confirm or cancel this.`)], flags: privateV2, allowedMentions: { parse: [] } });
    return;
  }
  if (action === "cancel") {
    await interaction.update({ components: [panel({ icon: "cross", title: "Unban cancelled", body: "The global ban is still in place." })] });
    return;
  }
  if (!(await ensureAccess(interaction, "globalunban"))) return;

  const { targetId, reason, banId } = taken.value;
  const ban = activeGlobalBan(targetId);
  if (!ban || ban.id !== banId) {
    await interaction.update({ components: [errorPanel("Already lifted", `Someone else lifted the global ban on <@${targetId}> in the meantime.`)], allowedMentions: { parse: [] } });
    return;
  }

  await interaction.update({ components: [panel({ icon: "clock", title: "Lifting the ban", body: "Working through each server." })] });

  const auditReason = `Global unban by ${interaction.user.username} (${interaction.user.id}): ${reason}`.slice(0, 512);
  const outcomes: Outcome[] = [];
  for (const server of SERVERS) {
    const guild = interaction.client.guilds.cache.get(server.id);
    if (!guild) {
      outcomes.push({ server, status: "missing" });
      continue;
    }
    try {
      await guild.bans.remove(targetId, auditReason);
      outcomes.push({ server, status: "lifted" });
    } catch (error) {
      outcomes.push(isUnknownBan(error) ? { server, status: "clear" } : { server, status: "failed", detail: failureText(error) });
    }
  }
  liftGlobalBan(ban.id, interaction.user.id, reason);

  const label = await userLabel(interaction.client, targetId);
  const lines = outcomes.map(describe).join("\n");
  const failed = outcomes.filter((outcome) => outcome.status === "failed").length;

  await interaction.editReply({
    flags: v2,
    components: [
      panel({
        icon: failed ? "alert-triangle" : "check",
        title: failed ? "Global ban lifted with errors" : "Global ban lifted",
        body: failed ? `<@${targetId}> is off the global ban list, but some servers refused the unban.` : `<@${targetId}> is off the global ban list.`,
        details: [line("user", "User", label.text), line("text-bubble", "Reason", reason), "", lines],
      }),
    ],
    allowedMentions: { parse: [] },
  });

  await postLog(
    interaction.client,
    panel({
      icon: "unlock",
      title: "Global ban lifted",
      body: `<@${targetId}>`,
      details: [
        line("user", "User", label.text),
        line("crown", "Lifted by", `<@${interaction.user.id}> \`${interaction.user.id}\``),
        line("text-bubble", "Reason", reason),
        line("paper", "Original ban", `by <@${ban.issuedBy}> ${time(ban.issuedAt, "f")}: ${ban.reason}`),
        "",
        lines,
      ],
      footer: time(Date.now(), "F"),
    }),
  );
};
