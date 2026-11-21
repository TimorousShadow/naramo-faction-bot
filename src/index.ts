// TimorousShadow
import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { handleBanlistButton, runBanlist } from "./commands/banlist.js";
import { errorPanel, privateV2, v2 } from "./ui.js";

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN is required.");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (ready) => console.log(`Logged in as ${ready.user.tag}`));

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "banlist") await runBanlist(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith("banlist:")) await handleBanlistButton(interaction);
  } catch (error) {
    console.error(error);
    if (!interaction.isRepliable()) return;
    const components = [errorPanel("Something went wrong", "The action stopped before it finished. Try again, and check the server's ban list before you do.")];
    if (interaction.deferred || interaction.replied) await interaction.editReply({ components, flags: v2 }).catch(() => undefined);
    else await interaction.reply({ components, flags: privateV2 }).catch(() => undefined);
  }
});

const shutdown = () => client.destroy().finally(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await client.login(token);
