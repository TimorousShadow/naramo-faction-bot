// TimorousShadow
import { randomUUID } from "node:crypto";
import {
  AttachmentBuilder,
  ButtonStyle,
  FileBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
} from "discord.js";
import { readIdList } from "../id-list.js";
import { button, errorPanel, line, panel, privateV2, v2 } from "../ui.js";

const MAX_IDS = 2000;
const MAX_BYTES = 2 * 1024 * 1024;
const CHUNK = 200;
const TTL_MS = 10 * 60 * 1000;

interface Pending {
  guildId: string;
  userId: string;
  fileName: string;
  ids: string[];
  expiresAt: number;
}

const pending = new Map<string, Pending>();

export const banlistCommand = new SlashCommandBuilder()
  .setName("banlist")
  .setDescription("Ban every Discord ID listed in a CSV file")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addAttachmentOption((option) =>
    option.setName("file").setDescription("CSV with one Discord user ID per line, or an id column").setRequired(true),
  );

const plural = (count: number, word: string): string => `${count.toLocaleString("en-US")} ${word}${count === 1 ? "" : "s"}`;

const fetchBannedIds = async (guild: Guild): Promise<Set<string>> => {
  const banned = new Set<string>();
  let after: string | undefined;
  for (;;) {
    const page = await guild.bans.fetch({ limit: 1000, ...(after ? { after } : {}), cache: false });
    for (const id of page.keys()) banned.add(id);
    if (page.size < 1000) return banned;
    after = page.lastKey();
  }
};

const fail = (interaction: ChatInputCommandInteraction | ButtonInteraction, title: string, body: string) => {
  const components = [errorPanel(title, body)];
  if (interaction.deferred || interaction.replied) return interaction.editReply({ components, flags: v2 });
  return interaction.reply({ components, flags: v2 });
};

export const runBanlist = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const guild = interaction.guild;
  if (!guild) {
    await fail(interaction, "Server only", "Run /banlist inside the server you want to ban people from.");
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await fail(interaction, "Administrators only", "You need the Administrator permission to use /banlist.");
    return;
  }
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers)) {
    await fail(interaction, "Missing permission", "I need the Ban Members permission in this server before I can run a ban list.");
    return;
  }

  const file = interaction.options.getAttachment("file", true);
  const looksLikeText = /\.(csv|txt)$/i.test(file.name) || /csv|text\/plain/i.test(file.contentType ?? "");
  if (!looksLikeText) {
    await fail(interaction, "That file isn't a CSV", "Upload a `.csv` or `.txt` file with one Discord user ID per line, or with a column named `id` or `discord_id`.");
    return;
  }
  if (file.size > MAX_BYTES) {
    await fail(interaction, "File too large", `\`${file.name}\` is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.`);
    return;
  }

  await interaction.deferReply();

  let text: string;
  try {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(String(response.status));
    text = await response.text();
  } catch {
    await fail(interaction, "Couldn't read the file", "Discord didn't let me download the attachment. Upload it again.");
    return;
  }

  const list = readIdList(text);
  const notes: string[] = [];
  if (list.rounded.length)
    notes.push(line("alert-triangle", "Rounded IDs", `${plural(list.rounded.length, "value")} like \`${list.rounded[0]}\` were shortened by Excel and can't be used. Format the column as text and export again.`));
  if (list.malformed.length)
    notes.push(line("alert-circle", "Unreadable", `${plural(list.malformed.length, "value")}, for example \`${list.malformed[0]?.slice(0, 40)}\`.`));

  if (list.ids.length === 0) {
    await interaction.editReply({
      components: [errorPanel("No Discord IDs found", [`I couldn't find any user IDs in \`${file.name}\`. Put one ID per line, or add a column named \`id\` or \`discord_id\`.`, ...notes].join("\n"))],
      flags: v2,
    });
    return;
  }
  if (list.ids.length > MAX_IDS) {
    await fail(interaction, "Too many IDs", `One upload can ban up to ${MAX_IDS.toLocaleString("en-US")} accounts. \`${file.name}\` has ${list.ids.length.toLocaleString("en-US")}. Split it into smaller files.`);
    return;
  }

  let banned: Set<string>;
  try {
    banned = await fetchBannedIds(guild);
  } catch {
    await fail(interaction, "Couldn't check existing bans", "Discord didn't return the server's ban list. Try again in a minute.");
    return;
  }

  const protectedIds = new Set([interaction.user.id, interaction.client.user.id, guild.ownerId]);
  const skipped = list.ids.filter((id) => protectedIds.has(id));
  const already = list.ids.filter((id) => banned.has(id) && !protectedIds.has(id));
  const targets = list.ids.filter((id) => !banned.has(id) && !protectedIds.has(id));

  const details = [
    line("list", "IDs in file", list.ids.length.toLocaleString("en-US")),
    ...(list.column ? [line("filter", "Column", `\`${list.column}\``)] : []),
    ...(already.length ? [line("archive", "Already banned", already.length.toLocaleString("en-US"))] : []),
    ...(list.duplicates ? [line("minus", "Duplicates removed", list.duplicates.toLocaleString("en-US"))] : []),
    ...(skipped.length ? [line("lock", "Skipped", "you, this bot or the server owner")] : []),
    ...notes,
  ];

  if (targets.length === 0) {
    await interaction.editReply({
      components: [panel({ icon: "check", title: "Nothing to ban", body: `Every ID in \`${file.name}\` is already banned or can't be banned.`, details })],
      flags: v2,
    });
    return;
  }

  const token = randomUUID();
  const expiresAt = Date.now() + TTL_MS;
  pending.set(token, { guildId: guild.id, userId: interaction.user.id, fileName: file.name, ids: targets, expiresAt });
  setTimeout(() => pending.delete(token), TTL_MS).unref();

  const sample = targets.slice(0, 5).map((id) => `<@${id}> \`${id}\``).join("\n");
  await interaction.editReply({
    components: [
      panel({
        icon: "user-cross",
        title: "Check the ban list",
        body: [`\`${file.name}\` will ban **${plural(targets.length, "account")}** from ${guild.name}.`, "", sample, ...(targets.length > 5 ? [`-# and ${targets.length - 5} more`] : [])],
        details,
        buttons: [
          button(`banlist:confirm:${token}`, `Ban ${plural(targets.length, "account")}`, ButtonStyle.Danger, "user-cross"),
          button(`banlist:cancel:${token}`, "Cancel", ButtonStyle.Secondary, "cross"),
        ],
        footer: `Nothing happens until you confirm. This expires <t:${Math.floor(expiresAt / 1000)}:R>.`,
      }),
    ],
    flags: v2,
    allowedMentions: { parse: [] },
  });
};

export const handleBanlistButton = async (interaction: ButtonInteraction): Promise<void> => {
  const [, action, token] = interaction.customId.split(":");
  const job = token ? pending.get(token) : undefined;
  if (!job || job.expiresAt < Date.now()) {
    await interaction.update({ components: [errorPanel("This confirmation expired", "Nobody was banned. Run /banlist again to start over.")], flags: v2 });
    return;
  }
  if (interaction.user.id !== job.userId) {
    await interaction.reply({ components: [errorPanel("Not your ban list", `Only <@${job.userId}> can confirm or cancel this one.`)], flags: privateV2, allowedMentions: { parse: [] } });
    return;
  }
  pending.delete(token!);

  if (action === "cancel") {
    await interaction.update({ components: [panel({ icon: "cross", title: "Ban list cancelled", body: "Nobody was banned." })], flags: v2 });
    return;
  }

  const guild = interaction.guild;
  if (!guild || guild.id !== job.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.update({ components: [errorPanel("Administrators only", "You need the Administrator permission to confirm a ban list.")], flags: v2 });
    return;
  }

  const total = job.ids.length;
  const progress = (done: number) =>
    panel({ icon: "clock", title: "Banning accounts", body: `${done.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} done.`, footer: `From \`${job.fileName}\`` });
  await interaction.update({ components: [progress(0)], flags: v2 });

  const reason = `Ban list ${job.fileName} uploaded by ${interaction.user.username} (${interaction.user.id})`.slice(0, 512);
  const bannedIds: string[] = [];
  const failedIds: string[] = [];
  for (let i = 0; i < total; i += CHUNK) {
    const chunk = job.ids.slice(i, i + CHUNK);
    try {
      const result = await guild.bans.bulkCreate(chunk, { reason, deleteMessageSeconds: 0 });
      bannedIds.push(...result.bannedUsers);
      failedIds.push(...result.failedUsers);
    } catch {
      failedIds.push(...chunk);
    }
    await interaction.editReply({ components: [progress(Math.min(i + CHUNK, total))], flags: v2 }).catch(() => undefined);
  }

  const details = [
    line("check", "Banned", bannedIds.length.toLocaleString("en-US")),
    ...(failedIds.length ? [line("alert-triangle", "Not banned", `${failedIds.length.toLocaleString("en-US")}. The IDs are in the attached file.`)] : []),
  ];
  const result = panel({
    icon: failedIds.length ? "alert-triangle" : "check",
    title: failedIds.length ? "Ban list finished with errors" : "Ban list done",
    body: failedIds.length
      ? "Discord refused some bans. Usually the account no longer exists, or it has a role above mine."
      : `Everyone in \`${job.fileName}\` is now banned.`,
    details,
    footer: `Confirmed by ${interaction.user.username}`,
  });
  const files: AttachmentBuilder[] = [];
  if (failedIds.length) {
    files.push(new AttachmentBuilder(Buffer.from(`${failedIds.join("\n")}\n`), { name: "not-banned.txt" }));
    result.addFileComponents(new FileBuilder().setURL("attachment://not-banned.txt"));
  }
  await interaction.editReply({ components: [result], files, flags: v2 });
};
