// TimorousShadow
export const ICONS = [
  "alert-circle", "alert-triangle", "archive", "arrow-left", "arrow-right", "bell", "bookmark", "calendar", "check",
  "chevron-left", "chevron-right", "clock", "code", "cross", "crown", "external-link", "filter", "folder", "gears",
  "ghost", "globe", "grid", "heart", "home", "info", "info-box", "link", "list", "lock", "login", "logout", "mail",
  "menu", "minus", "newspaper", "paper", "pen", "pie", "pillar", "plus", "search", "sparkles", "star", "tasks",
  "text-bubble", "trash", "unlock", "user", "user-cross",
] as const;

export type IconName = (typeof ICONS)[number];

export const emojiName = (icon: IconName): string => `nf_${icon.replaceAll("-", "_")}`;

export const COLORS = { green: "#23A55A", red: "#F23F43", amber: "#F0B232", blurple: "#5865F2", grey: "#80848E" } as const;

export type ColorName = keyof typeof COLORS;

export const COLORED = [
  ["check", "green"],
  ["unlock", "green"],
  ["login", "green"],
  ["alert-triangle", "red"],
  ["alert-circle", "red"],
  ["user-cross", "red"],
  ["logout", "red"],
  ["globe", "red"],
  ["clock", "amber"],
  ["alert-circle", "amber"],
  ["crown", "amber"],
  ["gears", "blurple"],
  ["minus", "grey"],
] as const satisfies readonly (readonly [IconName, ColorName])[];

export type ColoredIcon = `${(typeof COLORED)[number][0]}:${(typeof COLORED)[number][1]}`;

export const coloredEmojiName = (icon: IconName, color: ColorName): string => `${emojiName(icon)}_${color}`;

export const LOGOS = ["rayward", "rotector", "serversweep", "okappiki", "rab", "tase", "robloxwatcher", "simmer", "xtracker", "catwatcher"] as const;

export type LogoName = (typeof LOGOS)[number];

export const logoEmojiName = (logo: LogoName): string => `nf_logo_${logo}`;
