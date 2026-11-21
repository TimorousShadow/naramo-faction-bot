// TimorousShadow
import { SlashCommandBuilder } from "discord.js";

export const helpCommand = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show the commands you can use here and what the icons mean")
  .setDMPermission(false);
