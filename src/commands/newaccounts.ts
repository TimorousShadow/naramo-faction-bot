// TimorousShadow
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { ensureAccess } from "../access.js";
import { userLabel } from "../network.js";
import { allowAccount, allowedAccount, allowedAccounts, disallowAccount } from "../store.js";
import { errorPanel, line, panel, time, v2 } from "../ui.js";

export const newaccountsCommand = new SlashCommandBuilder()
  .setName("newaccounts")
  .setDescription("Let specific new accounts join without being kicked")
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName("allow")
      .setDescription("Stop the new account kick for one user")
      .addUserOption((option) => option.setName("user").setDescription("User to allow, or paste their ID").setRequired(true))
      .addStringOption((option) => option.setName("reason").setDescription("For example: account transfer after a hack").setRequired(true).setMinLength(3).setMaxLength(200)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a user from the allow list")
      .addUserOption((option) => option.setName("user").setDescription("User to remove, or paste their ID").setRequired(true)),
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("Show every allowed account"));

export const runNewaccounts = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  if (!(await ensureAccess(interaction, "newaccounts"))) return;
  const sub = interaction.options.getSubcommand();

  if (sub === "list") {
    const entries = allowedAccounts();
    await interaction.reply({
      flags: v2,
      allowedMentions: { parse: [] },
      components: [
        panel({
          icon: "list",
          title: "Allowed new accounts",
          body: entries.length
            ? entries.slice(0, 40).map((entry) => `- <@${entry.userId}> \`${entry.userId}\` by <@${entry.addedBy}> ${time(entry.addedAt, "R")}\n-# ${entry.reason}`)
            : "Nobody is on the list. New accounts are kicked when they join.",
          ...(entries.length > 40 ? { footer: `and ${entries.length - 40} more` } : {}),
        }),
      ],
    });
    return;
  }

  const target = interaction.options.getUser("user", true);
  const label = await userLabel(interaction.client, target.id);

  if (sub === "remove") {
    const removed = disallowAccount(target.id);
    await interaction.reply({
      flags: v2,
      allowedMentions: { parse: [] },
      components: [
        removed
          ? panel({ icon: "user-cross:red", title: "Removed from the allow list", body: `<@${target.id}> is kicked again if their account is too new when they join.`, details: [line("user", "User", label.text)] })
          : errorPanel("Not on the list", `<@${target.id}> isn't on the allow list.`),
      ],
    });
    return;
  }

  const reason = interaction.options.getString("reason", true).trim();
  const existing = allowedAccount(target.id);
  allowAccount(target.id, interaction.user.id, reason);
  await interaction.reply({
    flags: v2,
    allowedMentions: { parse: [] },
    components: [
      panel({
        icon: "check:green",
        title: existing ? "Allow list entry updated" : "Account allowed",
        body: `<@${target.id}> can join without being kicked for a new account.`,
        details: [line("user", "User", label.text), line("text-bubble", "Reason", reason), line("calendar", "Account created", time(target.createdTimestamp, "R"))],
      }),
    ],
  });
};
