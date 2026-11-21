// TimorousShadow
import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { ensureAccess } from "../access.js";
import { MAIN_GUILD_ID, SERVERS } from "../config.js";
import { checkBans } from "../network.js";
import { robloxForDiscord } from "../roblox.js";
import { activeGlobalBan } from "../store.js";
import { line, linkButton, panel, privateV2, time } from "../ui.js";

const DAY = 24 * 60 * 60 * 1000;

export const lookupCommand = new SlashCommandBuilder()
  .setName("lookup")
  .setDescription("Show a user across the Naramo servers, with their Roblox account")
  .setDMPermission(false)
  .addUserOption((option) => option.setName("user").setDescription("User to look up, or paste their ID").setRequired(true));

const memberLine = async (client: Client, guildId: string, name: string, userId: string, banned: boolean): Promise<string> => {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return `- ${name}: bot not added yet`;
  if (banned) return `- ${name}: banned`;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return `- ${name}: not a member`;
  const roles = member.roles.cache
    .filter((role) => role.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .first(3)
    .map((role) => role.name);
  const joined = member.joinedTimestamp ? `joined ${time(member.joinedTimestamp, "R")}` : "member";
  return `- ${name}: ${joined}${roles.length ? `\n-# ${roles.join(", ")}` : ""}`;
};

export const runLookup = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  if (!(await ensureAccess(interaction, "lookup"))) return;
  await interaction.deferReply({ flags: privateV2 });
  const user = await interaction.client.users.fetch(interaction.options.getUser("user", true).id, { force: true });
  const [roblox, bans] = await Promise.all([robloxForDiscord(user.id), checkBans(interaction.client, user.id)]);
  const banned = new Set(bans.filter((ban) => ban.state === "banned").map((ban) => ban.server.id));
  const servers = await Promise.all([
    memberLine(interaction.client, MAIN_GUILD_ID, "Faction Management", user.id, false),
    ...SERVERS.map((server) => memberLine(interaction.client, server.id, server.name, user.id, banned.has(server.id))),
  ]);
  const global = activeGlobalBan(user.id);
  const ageDays = Math.floor((Date.now() - user.createdTimestamp) / DAY);

  const robloxLine =
    roblox.status === "linked"
      ? line("link", "Roblox", `[${roblox.account.name}](https://www.roblox.com/users/${roblox.account.id}/profile) \`${roblox.account.id}\`, created ${time(roblox.account.created, "D")}`)
      : roblox.status === "unlinked"
        ? line("link", "Roblox", "No account linked in Bloxlink")
        : line("link", "Roblox", "Bloxlink lookup unavailable");

  await interaction.editReply({
    components: [
      panel({
        icon: "user",
        title: user.globalName ?? user.username,
        body: [`<@${user.id}> \`${user.username}\` \`${user.id}\``, ...(user.bot ? ["-# Bot account"] : [])],
        details: [
          line("calendar", "Account created", `${time(user.createdTimestamp, "D")} (${ageDays.toLocaleString("en-US")} days ago)${ageDays < 30 ? ", new account" : ""}`),
          robloxLine,
          line("globe", "Global ban", global ? `yes, by <@${global.issuedBy}> ${time(global.issuedAt, "R")}` : "no"),
          "",
          line("home", "Servers", ""),
          ...servers,
        ],
        ...(roblox.status === "linked" ? { buttons: [linkButton("Roblox profile", `https://www.roblox.com/users/${roblox.account.id}/profile`)] } : {}),
      }),
    ],
    allowedMentions: { parse: [] },
  });
};
