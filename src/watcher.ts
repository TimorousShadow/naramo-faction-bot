// TimorousShadow
import {
  ApplicationCommandOptionType,
  escapeMarkdown,
  type Client,
  type CommandInteractionOption,
  type Guild,
  type GuildMember,
  type Interaction,
} from "discord.js";
import { WATCHER_CHANNEL_ID } from "./config.js";
import { icon, panel, v2, type AnyIcon } from "./ui.js";

const clip = (text: string, max = 300): string => {
  const clean = escapeMarkdown(text.replace(/\s+/g, " ").trim());
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

const optionValue = (option: CommandInteractionOption): string => {
  if (option.type === ApplicationCommandOptionType.User) return `<@${option.value}> \`${option.value}\``;
  if (option.type === ApplicationCommandOptionType.Channel) return `<#${option.value}>`;
  if (option.type === ApplicationCommandOptionType.Role) return `<@&${option.value}>`;
  if (option.type === ApplicationCommandOptionType.Attachment) {
    const file = option.attachment;
    return file ? `\`${clip(file.name, 80)}\` (${(file.size / 1024).toFixed(1)} KB)` : "file";
  }
  return clip(String(option.value ?? ""));
};

const flatten = (options: readonly CommandInteractionOption[], prefix = ""): string[] =>
  options.flatMap((option) =>
    option.options?.length ? flatten(option.options, `${prefix}${option.name} `) : [`\`${prefix}${option.name}\` ${optionValue(option)}`],
  );

const describe = (interaction: Interaction): { icon: AnyIcon; title: string; details: string[] } | null => {
  if (interaction.isChatInputCommand()) return { icon: "code", title: `/${interaction.commandName}`, details: flatten(interaction.options.data) };
  if (interaction.isButton()) {
    const [scope, action] = interaction.customId.split(":");
    return { icon: "grid", title: `Button · ${scope}${action ? ` ${action}` : ""}`, details: [] };
  }
  if (interaction.isModalSubmit()) {
    const fields = interaction.fields.fields.map((field) => ("value" in field ? `\`${field.customId}\` ${clip(String(field.value))}` : `\`${field.customId}\``));
    return { icon: "pen", title: `Form · ${interaction.customId.split(":")[0]}`, details: [...fields] };
  }
  if (interaction.isAnySelectMenu()) return { icon: "list", title: `Menu · ${interaction.customId.split(":")[0]}`, details: [`\`values\` ${clip(interaction.values.join(", "))}`] };
  return null;
};

let queue: Promise<unknown> = Promise.resolve();

const send = (client: Client, container: ReturnType<typeof panel>): void => {
  queue = queue
    .then(async () => {
      const channel = await client.channels.fetch(WATCHER_CHANNEL_ID).catch(() => null);
      if (channel?.isSendable()) await channel.send({ components: [container], flags: v2, allowedMentions: { parse: [] } });
    })
    .catch((error: unknown) => console.error("Watcher log failed", error));
};

export const watchInteraction = (interaction: Interaction, outcome: { ms: number; error?: unknown }): void => {
  const entry = describe(interaction);
  if (!entry) return;
  const where = interaction.guild ? `**${clip(interaction.guild.name, 60)}**${interaction.channelId ? ` · <#${interaction.channelId}>` : ""}` : "Direct message";
  const failed = outcome.error !== undefined;
  send(
    interaction.client,
    panel({
      icon: entry.icon,
      title: entry.title,
      body: [`<@${interaction.user.id}> \`${interaction.user.username}\` \`${interaction.user.id}\``, `-# ${where} · <t:${Math.floor(Date.now() / 1000)}:T> · ${outcome.ms} ms`],
      details: [
        ...entry.details,
        failed
          ? `${icon("alert-triangle:red")} **Failed** ${clip(outcome.error instanceof Error ? outcome.error.message : String(outcome.error), 200)}`
          : `${icon("check:green")} Completed`,
      ],
    }),
  );
};

export const watchGuild = (client: Client, guild: Guild, joined: boolean): void => {
  send(
    client,
    panel({
      icon: joined ? "login:green" : "logout:red",
      title: joined ? "Bot added to a server" : "Bot removed from a server",
      body: [`**${clip(guild.name, 80)}** \`${guild.id}\``, `-# ${guild.memberCount ? `${guild.memberCount.toLocaleString("en-US")} members · ` : ""}<t:${Math.floor(Date.now() / 1000)}:F>`],
    }),
  );
};

export const watchAgeKick = (member: GuildMember, days: number, notified: boolean, error?: unknown): void => {
  const failed = error !== undefined;
  send(
    member.client,
    panel({
      icon: failed ? "alert-triangle:red" : "user-cross:red",
      title: failed ? "New account not kicked" : "New account kicked",
      body: [
        `<@${member.id}> \`${member.user.username}\` \`${member.id}\``,
        `-# **${clip(member.guild.name, 60)}** · account created <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>, under ${days} days · <t:${Math.floor(Date.now() / 1000)}:T>`,
      ],
      details: [
        notified ? `${icon("mail")} Told by DM` : `${icon("mail")} DMs closed, not told`,
        ...(failed ? [`${icon("alert-triangle:red")} **Failed** ${clip(error instanceof Error ? error.message : String(error), 200)}`] : []),
      ],
    }),
  );
};
