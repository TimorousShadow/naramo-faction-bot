// TimorousShadow
import "dotenv/config";
import { Client, Events, GatewayIntentBits, type ButtonInteraction, type ChatInputCommandInteraction, type ModalSubmitInteraction } from "discord.js";
import { handleBanlistButton, runBanlist } from "./commands/banlist.js";
import { runGbaninfo } from "./commands/gbaninfo.js";
import { handleGlobalbanButton, handleGlobalbanModal, runGlobalban } from "./commands/globalban.js";
import { handleGlobalunbanButton, handleGlobalunbanModal, runGlobalunban } from "./commands/globalunban.js";
import { runLookup } from "./commands/lookup.js";
import { handleSafetyButton, runSafety } from "./commands/safety.js";
import { runStatus } from "./commands/status.js";
import { errorPanel, v2 } from "./ui.js";
import { watchGuild, watchInteraction } from "./watcher.js";

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN is required.");

const commands: Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>> = {
  banlist: runBanlist,
  globalban: runGlobalban,
  globalunban: runGlobalunban,
  gbaninfo: runGbaninfo,
  lookup: runLookup,
  status: runStatus,
  safety: runSafety,
};

const buttons: Record<string, (interaction: ButtonInteraction) => Promise<void>> = {
  banlist: handleBanlistButton,
  globalban: handleGlobalbanButton,
  globalunban: handleGlobalunbanButton,
  safety: handleSafetyButton,
};

const modals: Record<string, (interaction: ModalSubmitInteraction) => Promise<void>> = {
  "globalban-reason": handleGlobalbanModal,
  "globalunban-reason": handleGlobalunbanModal,
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (ready) => console.log(`Logged in as ${ready.user.tag}`));

client.on(Events.GuildCreate, (guild) => watchGuild(client, guild, true));
client.on(Events.GuildDelete, (guild) => watchGuild(client, guild, false));

client.on(Events.InteractionCreate, async (interaction) => {
  const started = Date.now();
  let failure: unknown;
  try {
    if (interaction.isChatInputCommand()) await commands[interaction.commandName]?.(interaction);
    else if (interaction.isButton()) await buttons[interaction.customId.split(":")[0] ?? ""]?.(interaction);
    else if (interaction.isModalSubmit()) await modals[interaction.customId.split(":")[0] ?? ""]?.(interaction);
  } catch (error) {
    failure = error;
    console.error(error);
    if (!interaction.isRepliable()) return;
    const components = [errorPanel("Something went wrong", "The action stopped before it finished. Check the result with /gbaninfo or /status before trying again.")];
    if (interaction.deferred || interaction.replied) await interaction.editReply({ flags: v2, components }).catch(() => undefined);
    else await interaction.reply({ components, flags: v2 }).catch(() => undefined);
  } finally {
    watchInteraction(interaction, { ms: Date.now() - started, ...(failure === undefined ? {} : { error: failure }) });
  }
});

const shutdown = () => client.destroy().finally(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await client.login(token);
