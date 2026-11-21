// TimorousShadow
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  type APIMessageComponentEmoji,
} from "discord.js";
import emojis from "./emojis.json" with { type: "json" };
import { coloredEmojiName, emojiName, logoEmojiName, type ColoredIcon, type ColorName, type IconName, type LogoName } from "./icon-set.js";

const ids = emojis as Record<string, string>;

export type AnyIcon = IconName | ColoredIcon;

const resolve = (name: AnyIcon): string => {
  const [base, color] = name.split(":") as [IconName, ColorName | undefined];
  return color ? coloredEmojiName(base, color) : emojiName(base);
};

export const emoji = (name: AnyIcon): APIMessageComponentEmoji => ({ id: ids[resolve(name)], name: resolve(name) });

export const icon = (name: AnyIcon): string => {
  const id = ids[resolve(name)];
  return id ? `<:${resolve(name)}:${id}>` : "";
};

export const logo = (name: LogoName): string => {
  const id = ids[logoEmojiName(name)];
  return id ? `<:${logoEmojiName(name)}:${id}>` : "";
};

export const line = (name: AnyIcon, label: string, value: string): string => `${icon(name)} **${label}** ${value}`;

export interface PanelOptions {
  icon: AnyIcon;
  title: string;
  body?: string | string[];
  details?: string[];
  footer?: string;
  buttons?: ButtonBuilder[];
}

export const panel = (options: PanelOptions): ContainerBuilder => {
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${icon(options.icon)} ${options.title}`),
  );
  const body = Array.isArray(options.body) ? options.body.join("\n") : options.body;
  if (body) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  if (options.details?.length) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(options.details.join("\n")));
  }
  if (options.buttons?.length) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));
    container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(options.buttons));
  }
  if (options.footer) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${options.footer}`));
  }
  return container;
};

export const button = (id: string, label: string, style: ButtonStyle, name?: AnyIcon): ButtonBuilder => {
  const built = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  return name && ids[resolve(name)] ? built.setEmoji(emoji(name)) : built;
};

export const errorPanel = (title: string, body: string, footer?: string): ContainerBuilder =>
  panel({ icon: "alert-circle:red", title, body, ...(footer ? { footer } : {}) });

export const v2 = MessageFlags.IsComponentsV2;
export const privateV2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

export const reasonModal = (customId: string, title: string, placeholder: string): ModalBuilder =>
  new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("reason").setLabel("Reason").setStyle(TextInputStyle.Paragraph).setMinLength(3).setMaxLength(400).setPlaceholder(placeholder).setRequired(true),
      ),
    );

export const linkButton = (label: string, url: string): ButtonBuilder => new ButtonBuilder().setLabel(label).setURL(url).setStyle(ButtonStyle.Link);

export const time = (ms: number, style: "R" | "f" | "D" | "F" = "f"): string => `<t:${Math.floor(ms / 1000)}:${style}>`;
