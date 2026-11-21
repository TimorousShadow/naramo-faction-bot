// TimorousShadow
import { randomUUID } from "node:crypto";
import {
  ButtonStyle,
  DiscordAPIError,
  RESTJSONErrorCodes,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type User,
} from "discord.js";
import { GLOBAL_BAN_LOG_CHANNEL_ID, GLOBAL_BAN_ROLE_ID, MAIN_GUILD_ID } from "../config.js";
import { button, errorPanel, line, panel, privateV2, v2 } from "../ui.js";

const TTL_MS = 5 * 60 * 1000;

interface Pending {
  userId: string;
  targetId: string;
  reason: string;
  expiresAt: number;
}

type Outcome = { guild: Guild; status: "banned" | "already" | "failed"; detail?: string };

const pending = new Map<string, Pending>();

export const globalbanCommand = new SlashCommandBuilder()
  .setName("globalban")
  .setDescription("Ban a user from every server the bot is in")
  .setDMPermission(false)
  .addUserOption((option) => option.setName("user").setDescription("User to ban, or paste their ID").setRequired(true))
  .addStringOption((option) => option.setName("reason").setDescription("Shown in each server's audit log and in the ban log").setRequired(true).setMinLength(3).setMaxLength(400));

const hasAccess = async (client: Client, userId: string): Promise<boolean> => {
  const guild = client.guilds.cache.get(MAIN_GUILD_ID);
  const member = await guild?.members.fetch(userId).catch(() => null);
  return member?.roles.cache.has(GLOBAL_BAN_ROLE_ID) ?? false;
};

const deny = (interaction: ChatInputCommandInteraction | ButtonInteraction) =>
  interaction.reply({
    components: [errorPanel("No access", `Only members of Naramo Faction Management with the <@&${GLOBAL_BAN_ROLE_ID}> role can use /globalban.`)],
    flags: privateV2,
    allowedMentions: { parse: [] },
  });

const describe = (outcome: Outcome): string => {
  if (outcome.status === "banned") return `${outcome.guild.name}: banned`;
  if (outcome.status === "already") return `${outcome.guild.name}: already banned`;
  return `${outcome.guild.name}: failed${outcome.detail ? ` (${outcome.detail})` : ""}`;
};

const banIn = async (guild: Guild, userId: string, reason: string): Promise<Outcome> => {
  const existing = await guild.bans.fetch({ user: userId, force: true }).catch(() => null);
  if (existing) return { guild, status: "already" };
  try {
    await guild.bans.create(userId, { reason, deleteMessageSeconds: 0 });
    return { guild, status: "banned" };
  } catch (error) {
    if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.MissingPermissions)
      return { guild, status: "failed", detail: "missing permission or role too low" };
    return { guild, status: "failed", detail: error instanceof DiscordAPIError ? error.message : "unknown error" };
  }
};

export const runGlobalban = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  if (interaction.guildId !== MAIN_GUILD_ID || !(await hasAccess(interaction.client, interaction.user.id))) {
    await deny(interaction);
    return;
  }
  const target: User = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true).trim();
  const guilds = [...interaction.client.guilds.cache.values()];

  const blocked =
    target.id === interaction.user.id
      ? "You can't global ban yourself."
      : target.id === interaction.client.user.id
        ? "The bot can't ban itself."
        : guilds.some((guild) => guild.ownerId === target.id)
          ? "This user owns one of the bot's servers."
          : (await hasAccess(interaction.client, target.id))
            ? `This user has the <@&${GLOBAL_BAN_ROLE_ID}> role. Remove it first if the ban is intended.`
            : null;
  if (blocked) {
    await interaction.reply({ components: [errorPanel("Can't ban this user", blocked)], flags: privateV2, allowedMentions: { parse: [] } });
    return;
  }

  const token = randomUUID();
  const expiresAt = Date.now() + TTL_MS;
  pending.set(token, { userId: interaction.user.id, targetId: target.id, reason, expiresAt });
  setTimeout(() => pending.delete(token), TTL_MS).unref();

  await interaction.reply({
    components: [
      panel({
        icon: "globe",
        title: "Confirm global ban",
        body: `<@${target.id}> will be banned from **${guilds.length}** server${guilds.length === 1 ? "" : "s"}.`,
        details: [
          line("user", "User", `${target.username} \`${target.id}\``),
          line("text-bubble", "Reason", reason),
          line("home", "Servers", guilds.map((guild) => guild.name).join(", ")),
        ],
        buttons: [
          button(`globalban:confirm:${token}`, "Ban everywhere", ButtonStyle.Danger, "user-cross"),
          button(`globalban:cancel:${token}`, "Cancel", ButtonStyle.Secondary, "cross"),
        ],
        footer: `Nothing happens until you confirm. This expires <t:${Math.floor(expiresAt / 1000)}:R>.`,
      }),
    ],
    flags: privateV2,
    allowedMentions: { parse: [] },
  });
};

export const handleGlobalbanButton = async (interaction: ButtonInteraction): Promise<void> => {
  const [, action, token] = interaction.customId.split(":");
  const job = token ? pending.get(token) : undefined;
  if (!job || job.expiresAt < Date.now()) {
    await interaction.update({ components: [errorPanel("This confirmation expired", "Nobody was banned. Run /globalban again.")], flags: v2 });
    return;
  }
  if (interaction.user.id !== job.userId) {
    await interaction.reply({ components: [errorPanel("Not your confirmation", `Only <@${job.userId}> can confirm or cancel this.`)], flags: privateV2, allowedMentions: { parse: [] } });
    return;
  }
  pending.delete(token!);

  if (action === "cancel") {
    await interaction.update({ components: [panel({ icon: "cross", title: "Global ban cancelled", body: "Nobody was banned." })], flags: v2 });
    return;
  }
  if (!(await hasAccess(interaction.client, interaction.user.id))) {
    await interaction.update({ components: [errorPanel("No access", `You no longer have the <@&${GLOBAL_BAN_ROLE_ID}> role.`)], flags: v2, allowedMentions: { parse: [] } });
    return;
  }

  await interaction.update({ components: [panel({ icon: "clock", title: "Banning everywhere", body: "Working through each server." })], flags: v2 });

  const target = await interaction.client.users.fetch(job.targetId).catch(() => null);
  const auditReason = `Global ban by ${interaction.user.username} (${interaction.user.id}): ${job.reason}`.slice(0, 512);
  const outcomes: Outcome[] = [];
  for (const guild of interaction.client.guilds.cache.values()) outcomes.push(await banIn(guild, job.targetId, auditReason));

  const banned = outcomes.filter((outcome) => outcome.status === "banned").length;
  const already = outcomes.filter((outcome) => outcome.status === "already").length;
  const failed = outcomes.filter((outcome) => outcome.status === "failed");
  const name = target ? `${target.username} \`${target.id}\`` : `\`${job.targetId}\``;
  const servers = outcomes.map((outcome) => `${outcome.status === "failed" ? "-# " : ""}${describe(outcome)}`).join("\n");

  await interaction.editReply({
    components: [
      panel({
        icon: failed.length ? "alert-triangle" : "check",
        title: failed.length ? "Global ban finished with errors" : "Global ban done",
        body: `<@${job.targetId}> is banned in ${banned + already} of ${outcomes.length} servers.`,
        details: [line("user", "User", name), line("text-bubble", "Reason", job.reason), "", servers],
      }),
    ],
    flags: v2,
    allowedMentions: { parse: [] },
  });

  const channel = await interaction.client.channels.fetch(GLOBAL_BAN_LOG_CHANNEL_ID).catch(() => null);
  if (channel?.isSendable()) {
    await channel
      .send({
        components: [
          panel({
            icon: "user-cross",
            title: "Global ban",
            body: `<@${job.targetId}>`,
            details: [
              line("user", "User", name),
              line("crown", "Issued by", `<@${interaction.user.id}> \`${interaction.user.id}\``),
              line("text-bubble", "Reason", job.reason),
              line("home", "Servers", `${banned} banned, ${already} already banned, ${failed.length} failed`),
              "",
              servers,
            ],
            footer: `<t:${Math.floor(Date.now() / 1000)}:F>`,
          }),
        ],
        flags: v2,
        allowedMentions: { parse: [] },
      })
      .catch((error: unknown) => console.error("Global ban log failed", error));
  }
};
