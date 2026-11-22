// TimorousShadow
import type { GuildMember } from "discord.js";
import { minAccountAgeDays } from "./config.js";
import { panel, v2 } from "./ui.js";
import { watchAgeKick } from "./watcher.js";

const DAY = 24 * 60 * 60 * 1000;

export const kickNotice = (guildName: string) =>
  panel({
    icon: "user-cross:red",
    title: `Removed from ${guildName}`,
    body: "Your account was flagged as suspicious (possible alternative account), so you were removed from the server.",
  });

export const enforceAccountAge = async (member: GuildMember): Promise<void> => {
  const days = minAccountAgeDays(member.guild.id);
  if (!days || member.user.bot || Date.now() - member.user.createdTimestamp >= days * DAY) return;
  const notified = await member
    .send({ components: [kickNotice(member.guild.name)], flags: v2 })
    .then(() => true)
    .catch(() => false);
  try {
    await member.kick(`Discord account is less than ${days} days old`);
    watchAgeKick(member, days, notified);
  } catch (error) {
    watchAgeKick(member, days, notified, error);
  }
};
