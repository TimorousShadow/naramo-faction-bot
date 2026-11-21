# Naramo Faction bot

Discord bot for the Naramo Faction Management server.

## Commands

`/banlist file:` bans every Discord user ID in a CSV. Only administrators can run it. The file can be one ID per line, or a table with a column named `id`, `user id` or `discord_id`. The bot shows what it found, skips accounts that are already banned, and waits for you to confirm. IDs that Excel rounded (like `1.42E+18`) are reported so you can export them again as text. It works in every server the bot is in.

The commands below only exist in Naramo Faction Management and need the Access role there.

`/globalban user: reason:` bans a user from the servers listed in `config.json` (ANRO, NES and NMP) and records it as a global ban. Leave the reason empty to type it in a form. Members of Naramo Faction Management can only be targeted by the admin role, and admins can't be targeted at all. Server owners, the bot and the person running the command are refused too.

`/globalunban user: reason:` lifts a recorded global ban in every server and logs it. Bans that weren't made with `/globalban` are left alone.

`/gbaninfo user:` shows whether someone is globally banned, who banned them and why, any lifted ban, and their ban in each server with the moderator from the audit log.

`/lookup user:` shows one person across the network: account age, Roblox account through Bloxlink, global ban status, and membership, join date and top roles in each server.

`/safety user: roblox:` runs every safety checker on a Discord user, a Roblox username or ID, or both: Rotector, ServerSweep, Okappiki, RAB and TASE via Rayward, Roblox Watcher, Exploit Watcher, Simmer, X Tracker and Cat Watcher. It also lists other Discord accounts linked to the same Roblox account. `/lookup` has a button that runs it for the person shown.

`/status` checks each server: whether the bot is there, whether it has Ban Members, Manage Server and View Audit Log, and how many roles sit above it. It also shows the global ban count, the log channel, Bloxlink and the running version.

Global bans and unbans are posted to the global ban log channel. Command replies are visible in the channel.

## Running it

Needs Node 24. Global bans are stored in SQLite under `DATA_DIR` (default `~/.naramo-faction`). Set `BLOXLINK_API_KEY` and `BLOXLINK_GUILD_ID` to find Roblox accounts; Roblox Watcher is used when Bloxlink has no link. Each safety checker runs when its key is set in `.env` (see `.env.example`).

```sh
cp .env.example .env
npm ci
npm run register
npm start
```

`npm run icons:upload` uploads the icons in `assets/icons` as server emojis named `nf_<icon>` and writes their IDs to `src/emojis.json`. `npx tsx scripts/upload-storage.ts` uploads the coloured icons in `assets/icons/colored` (named `nf_<icon>_<colour>`) and the provider logos to the emoji storage server set in `STORAGE_GUILD_ID`. Provider logos belong to their owners and aren't kept in this repo; point `LOGO_DIR` at a folder of 128px PNGs named after each provider to upload them. To render the icons again from the Papicons SVGs, set `PAPICONS_DIR` and run `npm run icons:build`.

## Configuration

`config.json` holds the main server, the role and log channel for global bans, and the list of servers a global ban applies to.

## Deployment

Every push to `main` runs the typecheck in GitHub Actions. The production VM checks `main` every two minutes, type-checks new commits in a staging copy and deploys them if that passes. The files for that are in `deploy/`.

## Credits

Icons are from [Papicons](https://github.com/PapillonApp/Papicons), MIT licensed.
