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
