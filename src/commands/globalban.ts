// TimorousShadow
import {
  ButtonStyle,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { ensureAccess, targetBlock } from "../access.js";
import { SERVERS, type ServerEntry } from "../config.js";
import { failureText, postLog, userLabel } from "../network.js";
import { PendingStore } from "../pending.js";
import { activeGlobalBan, recordGlobalBan } from "../store.js";
import { button, errorPanel, line, panel, privateV2, reasonModal, time, v2 } from "../ui.js";

type Outcome = { server: ServerEntry; status: "banned" | "already" | "failed" | "missing"; detail?: string };

const pending = new PendingStore<{ targetId: string; reason: string }>(5 * 60 * 1000);

export const globalbanCommand = new SlashCommandBuilder()
  .setName("globalban")
  .setDescription("Ban a user from every Naramo server in the config")
  .setDMPermission(false)
  .addUserOption((option) => option.setName("user").setDescription("User to ban, or paste their ID").setRequired(true))
  .addStringOption((option) => option.setName("reason").setDescription("Leave empty to type it in a form").setMinLength(3).setMaxLength(400));

const describe = (outcome: Outcome): string => {
  if (outcome.status === "banned") return `- ${outcome.server.name}: banned`;
  if (outcome.status === "already") return `- ${outcome.server.name}: already banned`;
  if (outcome.status === "missing") return `- ${outcome.server.name}: skipped, bot not added yet`;
  return `- ${outcome.server.name}: failed (${outcome.detail ?? "unknown error"})`;
};

const confirm = async (interaction: ChatInputCommandInteraction | ModalSubmitInteraction, targetId: string, reason: string): Promise<void> => {
  const blocked = await targetBlock(interaction.client, interaction.user.id, targetId);
  if (blocked) {
    await interaction.reply({ components: [errorPanel("Can't ban this user", blocked)], flags: v2, allowedMentions: { parse: [] } });
    return;
  }
  const existing = activeGlobalBan(targetId);
  if (existing) {
    await interaction.reply({
      components: [errorPanel("Already globally banned", `<@${targetId}> was globally banned by <@${existing.issuedBy}> ${time(existing.issuedAt, "R")}.\n-# ${existing.reason}`, "Use /gbaninfo for the details or /globalunban to lift it.")],
      flags: v2,
      allowedMentions: { parse: [] },
    });
    return;
  }

  const label = await userLabel(interaction.client, targetId);
  const reachable = SERVERS.filter((server) => interaction.client.guilds.cache.has(server.id));
  const { token, expiresAt } = pending.create(interaction.user.id, { targetId, reason });
  await interaction.reply({
    components: [
      panel({
        icon: "globe",
        title: "Confirm global ban",
        body: reachable.length
          ? `<@${targetId}> will be banned from **${reachable.length}** of ${SERVERS.length} servers.`
          : `The bot isn't in any of the ${SERVERS.length} servers yet, so nobody gets banned now. The global ban is still recorded and logged.`,
        details: [
          line("user", "User", label.text),
          line("text-bubble", "Reason", reason),
          line("home", "Servers", SERVERS.map((server) => (interaction.client.guilds.cache.has(server.id) ? server.name : `${server.name} (bot not added yet)`)).join(", ")),
        ],
        buttons: [
          button(`globalban:confirm:${token}`, "Ban everywhere", ButtonStyle.Danger, "user-cross:red"),
          button(`globalban:cancel:${token}`, "Cancel", ButtonStyle.Secondary, "cross"),
        ],
        footer: `Nothing happens until you confirm. This expires ${time(expiresAt, "R")}.`,
      }),
    ],
    flags: v2,
    allowedMentions: { parse: [] },
  });
};

export const runGlobalban = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  if (!(await ensureAccess(interaction, "globalban"))) return;
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason")?.trim();
  if (!reason) {
    await interaction.showModal(reasonModal(`globalban-reason:${target.id}`, "Global ban reason", "Shown in each server's audit log and in the ban log"));
    return;
  }
  await confirm(interaction, target.id, reason);
};

export const handleGlobalbanModal = async (interaction: ModalSubmitInteraction): Promise<void> => {
  if (!(await ensureAccess(interaction, "globalban"))) return;
  const targetId = interaction.customId.split(":")[1] ?? "";
  await confirm(interaction, targetId, interaction.fields.getTextInputValue("reason").trim());
};

export const handleGlobalbanButton = async (interaction: ButtonInteraction): Promise<void> => {
  const [, action, token] = interaction.customId.split(":");
  const taken = pending.take(token, interaction.user.id);
  if (taken.status === "expired") {
    await interaction.update({ components: [errorPanel("This confirmation expired", "Nobody was banned. Run /globalban again.")] });
    return;
  }
  if (taken.status === "other-user") {
    await interaction.reply({ components: [errorPanel("Not your confirmation", `Only <@${taken.userId}> can confirm or cancel this.`)], flags: privateV2, allowedMentions: { parse: [] } });
    return;
  }
  if (action === "cancel") {
    await interaction.update({ components: [panel({ icon: "cross", title: "Global ban cancelled", body: "Nobody was banned." })] });
    return;
  }
  if (!(await ensureAccess(interaction, "globalban"))) return;
  const { targetId, reason } = taken.value;
  const blocked = await targetBlock(interaction.client, interaction.user.id, targetId);
  if (blocked) {
    await interaction.update({ components: [errorPanel("Can't ban this user", blocked)], allowedMentions: { parse: [] } });
    return;
  }

  await interaction.update({ components: [panel({ icon: "clock", title: "Banning everywhere", body: "Working through each server." })] });

  const auditReason = `Global ban by ${interaction.user.username} (${interaction.user.id}): ${reason}`.slice(0, 512);
  const outcomes: Outcome[] = [];
  for (const server of SERVERS) {
    const guild = interaction.client.guilds.cache.get(server.id);
    if (!guild) {
      outcomes.push({ server, status: "missing" });
      continue;
    }
    if (await guild.bans.fetch({ user: targetId, force: true }).catch(() => null)) {
      outcomes.push({ server, status: "already" });
      continue;
    }
    try {
      await guild.bans.create(targetId, { reason: auditReason, deleteMessageSeconds: 0 });
      outcomes.push({ server, status: "banned" });
    } catch (error) {
      outcomes.push({ server, status: "failed", detail: failureText(error) });
    }
  }

  const label = await userLabel(interaction.client, targetId);
  const lines = outcomes.map(describe).join("\n");
  recordGlobalBan({ userId: targetId, username: label.username, reason, issuedBy: interaction.user.id, results: lines });

  const banned = outcomes.filter((outcome) => outcome.status === "banned").length;
  const already = outcomes.filter((outcome) => outcome.status === "already").length;
  const failed = outcomes.filter((outcome) => outcome.status === "failed").length;
  const missing = outcomes.filter((outcome) => outcome.status === "missing").length;

  await interaction.editReply({
    flags: v2,
    components: [
      panel({
        icon: failed ? "alert-triangle:red" : "check:green",
        title: failed ? "Global ban finished with errors" : "Global ban done",
        body: `<@${targetId}> is banned in ${banned + already} of ${outcomes.length} servers and recorded as globally banned.`,
        details: [line("user", "User", label.text), line("text-bubble", "Reason", reason), "", lines],
      }),
    ],
    allowedMentions: { parse: [] },
  });

  await postLog(
    interaction.client,
    panel({
      icon: "user-cross:red",
      title: "Global ban",
      body: `<@${targetId}>`,
      details: [
        line("user", "User", label.text),
        line("crown", "Issued by", `<@${interaction.user.id}> \`${interaction.user.id}\``),
        line("text-bubble", "Reason", reason),
        line("home", "Servers", `${banned} banned, ${already} already banned, ${failed} failed${missing ? `, ${missing} skipped` : ""}`),
        "",
        lines,
      ],
      footer: time(Date.now(), "F"),
    }),
  );
};
