// TimorousShadow
import type { ButtonInteraction, ChatInputCommandInteraction, Client, ModalSubmitInteraction, StringSelectMenuInteraction } from "discord.js";
import { ADMIN_ROLE_ID, GLOBAL_BAN_ROLE_ID, MAIN_GUILD_ID, SERVERS, commandAccessMinRoles, commandAccessRoles } from "./config.js";
import { errorPanel, privateV2, v2 } from "./ui.js";

type Gated = ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction;

export const hasAccess = async (client: Client, userId: string): Promise<boolean> => {
  const member = await client.guilds.cache.get(MAIN_GUILD_ID)?.members.fetch(userId).catch(() => null);
  return member?.roles.cache.has(GLOBAL_BAN_ROLE_ID) ?? false;
};

const memberRoleIds = (interaction: Gated): string[] => {
  const roles = interaction.member?.roles;
  if (!roles) return [];
  return Array.isArray(roles) ? roles : [...roles.cache.keys()];
};

export const ensureAccess = async (interaction: Gated, command: string): Promise<boolean> => {
  if (interaction.guildId === MAIN_GUILD_ID && (await hasAccess(interaction.client, interaction.user.id))) return true;
  const localRoles = commandAccessRoles(interaction.guildId, command);
  const minRoles = commandAccessMinRoles(interaction.guildId, command);
  const held = memberRoleIds(interaction);
  if (localRoles.length && held.some((role) => localRoles.includes(role))) return true;
  if (minRoles.length && interaction.guild) {
    const roles = interaction.guild.roles.cache;
    const highest = Math.max(0, ...held.map((role) => roles.get(role)?.position ?? 0));
    if (minRoles.some((role) => roles.has(role) && highest >= roles.get(role)!.position)) return true;
  }
  const allowed = [...localRoles.map((role) => `<@&${role}>`), ...minRoles.map((role) => `<@&${role}> or higher`)];
  const message = allowed.length
    ? `Only ${allowed.join(", ")} can use /${command} in this server.`
    : `Only members of Naramo Faction Management with the <@&${GLOBAL_BAN_ROLE_ID}> role can use /${command}.`;
  const components = [errorPanel("No access", message)];
  if (interaction.isButton() || interaction.isStringSelectMenu()) await interaction.reply({ components, flags: privateV2, allowedMentions: { parse: [] } });
  else if (interaction.deferred || interaction.replied) await interaction.editReply({ flags: v2, components, allowedMentions: { parse: [] } });
  else await interaction.reply({ components, flags: v2, allowedMentions: { parse: [] } });
  return false;
};

export const targetBlock = async (client: Client, actorId: string, targetId: string): Promise<string | null> => {
  if (targetId === actorId) return "You can't target yourself.";
  if (targetId === client.user?.id) return "The bot can't target itself.";
  const owners = [MAIN_GUILD_ID, ...SERVERS.map((server) => server.id)].map((id) => client.guilds.cache.get(id)?.ownerId);
  if (owners.includes(targetId)) return "This user owns one of the Naramo servers.";
  const main = client.guilds.cache.get(MAIN_GUILD_ID);
  const target = await main?.members.fetch(targetId).catch(() => null);
  if (!target) return null;
  if (target.roles.cache.has(ADMIN_ROLE_ID)) return `This user has the <@&${ADMIN_ROLE_ID}> role and can't be targeted.`;
  const actor = await main?.members.fetch(actorId).catch(() => null);
  if (!actor?.roles.cache.has(ADMIN_ROLE_ID)) return `This user is a member of Naramo Faction Management. Only <@&${ADMIN_ROLE_ID}> can target members of this server.`;
  return null;
};
