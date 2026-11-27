// TimorousShadow
import type { Client, GuildMember } from "discord.js";
import { FACTION_TAG_ROLES, GLOBAL_BAN_ROLE_ID, MAIN_GUILD_ID } from "./config.js";
import { robloxForDiscord } from "./roblox.js";

export const factionTag = (member: GuildMember): string | undefined => {
  if (member.guild.id !== MAIN_GUILD_ID || !member.roles.cache.has(GLOBAL_BAN_ROLE_ID)) return undefined;
  return Object.entries(FACTION_TAG_ROLES).find(([roleId]) => member.roles.cache.has(roleId))?.[1];
};

export const syncFactionTag = async (member: GuildMember): Promise<void> => {
  const tag = factionTag(member);
  if (!tag || !member.manageable) return;
  const roblox = await robloxForDiscord(member.id);
  if (roblox.status !== "linked") {
    console.log(`Faction tag skipped for ${member.id}: Roblox ${roblox.status}`);
    return;
  }
  const nickname = `${tag} | ${roblox.account.name}`;
  if (member.nickname === nickname) return;
  await member.setNickname(nickname, "Faction Leadership tag").catch((error: unknown) => console.error(`Faction tag failed for ${member.id}`, error));
};

export const syncAllFactionTags = async (client: Client): Promise<void> => {
  const guild = await client.guilds.fetch(MAIN_GUILD_ID);
  const members = await guild.members.fetch();
  for (const member of members.values()) await syncFactionTag(member);
};
