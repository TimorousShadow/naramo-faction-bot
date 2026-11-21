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
  ["check", "green", "clear", "Clean, nothing found"],
  ["alert-triangle", "red", "flagged", "Flagged by this check"],
  ["clock", "amber", "pending", "Queued or waiting for review"],
  ["alert-circle", "amber", "lookup_error", "The check failed or the service didn't answer"],
  ["minus", "grey", "unknown", "Skipped, not available or unknown"],
  ["alert-circle", "red", "flagged_account", "A linked account that is flagged"],
  ["user-cross", "red", "ban", "Ban"],
  ["unlock", "green", "unban", "Unban or ban lifted"],
  ["globe", "red", "global_ban", "Globally banned"],
  ["login", "green", "in_server", "Still in that server"],
  ["logout", "red", "left_server", "Left that server"],
  ["crown", "amber", "owner", "Owner of that server"],
  ["gears", "blurple", "staff", "Staff in that server"],
] as const satisfies readonly (readonly [IconName, ColorName, string, string])[];

export type ColoredIcon = `${(typeof COLORED)[number][0]}:${(typeof COLORED)[number][1]}`;

export const coloredEmojiName = (icon: IconName, color: ColorName): string => {
  const entry = COLORED.find(([base, tint]) => base === icon && tint === color);
  return entry ? `nf_${entry[2]}` : `${emojiName(icon)}_${color}`;
};

export const LOGOS = ["rayward", "rotector", "serversweep", "okappiki", "rab", "tase", "robloxwatcher", "simmer", "xtracker", "catwatcher"] as const;

export type LogoName = (typeof LOGOS)[number];

export const logoEmojiName = (logo: LogoName): string => `nf_logo_${logo}`;
