# Naramo Faction bot

Discord bot for the Naramo Faction Management server.

## Commands

`/banlist file:` bans every Discord user ID in a CSV. Only administrators can run it. The file can be one ID per line, or a table with a column named `id`, `user id` or `discord_id`. The bot shows what it found, skips accounts that are already banned, and waits for you to confirm. IDs that Excel rounded (like `1.42E+18`) are reported so you can export them again as text. It's available in Naramo Faction Management and in the servers listed in `config.json`.

The commands below only exist in Naramo Faction Management and need the Access role there. The NOSHA role can use all of them too.

`/globalban user: reason:` bans a user from the servers listed in `config.json` (ANRO, NES and NMP) and records it as a global ban. Leave the reason empty to type it in a form. Members of Naramo Faction Management can only be targeted by the admin and NOSHA roles, and admins and NOSHA can't be targeted at all. `/banlist` skips NOSHA members too. Server owners, the bot and the person running the command are refused too.

`/globalunban user: reason:` lifts a recorded global ban in every server and logs it. Bans that weren't made with `/globalban` are left alone.

`/gbaninfo user:` shows whether someone is globally banned, who banned them and why, any lifted ban, and their ban in each server with the moderator from the audit log.

`/newaccounts allow user: reason:`, `/newaccounts remove user:` and `/newaccounts list` manage the accounts that may join ANRO, NES and NMP even though they are new, for example after an account transfer.

`/lookup user:` shows one person across the network: account age, Roblox account through Bloxlink, global ban status, and membership, join date and top roles in each server.

`/safety user: roblox:` runs every safety checker on a Discord user, a Roblox username or ID, or both: Rotector, ServerSweep, Okappiki, RAB and TASE via Rayward, Roblox Watcher, Exploit Watcher, Simmer, X Tracker and Cat Watcher. It also lists other Discord accounts linked to the same Roblox account. `/lookup` has a button that runs it for the person shown.

`/help` lists the commands the person running it can use in that server and explains every status icon and provider logo. It's available wherever the bot has commands, to the same people who can use them.

`/status` checks each server: whether the bot is there, whether it has Ban Members, Manage Server and View Audit Log, and how many roles sit above it. It also shows the global ban count, the log channel, Bloxlink and the running version.

Global bans and unbans are posted to the global ban log channel. Every interaction with the bot in any server (commands with their options, buttons, forms, the result and how long it took) and every server the bot joins or leaves is logged to the watcher channel in Naramo Faction Management, which only the NOSHA role can see. Command replies are visible in the channel.

In the servers listed under `accountAgeKick` in `config.json` (ANRO, NES and NMP, 30 days), the bot kicks anyone who joins with a Discord account younger than that, after a DM saying the account was flagged as a possible alternative account, and logs it to the watcher channel. Bots are left alone, and so are NOSHA members and anyone on the allow list. If the bot can't kick someone it sends no DM. This needs the Server Members intent, which is on in the developer portal.

## Running it

Needs Node 24. Global bans are stored in SQLite under `DATA_DIR` (default `~/.naramo-faction`). Set `BLOXLINK_API_KEY` and `BLOXLINK_GUILD_ID` to find Roblox accounts; Roblox Watcher is used when Bloxlink has no link. Each safety checker runs when its key is set in `.env` (see `.env.example`).

```sh
cp .env.example .env
npm ci
npm run register
npm start
```

`npm run icons:upload` uploads the icons in `assets/icons` as server emojis named `nf_<icon>` and writes their IDs to `src/emojis.json`. `npx tsx scripts/upload-storage.ts` uploads the coloured status icons in `assets/icons/colored` (named after their meaning, for example `nf_flagged` or `nf_left_server`) and the provider logos to the emoji storage server set in `STORAGE_GUILD_ID`. Provider logos belong to their owners and aren't kept in this repo; point `LOGO_DIR` at a folder of 128px PNGs named after each provider to upload them. To render the icons again from the Papicons SVGs, set `PAPICONS_DIR` and run `npm run icons:build`.

## Configuration

`config.json` holds the main server, the watcher channel, per-server command access (a list of roles, or a minimum role that also covers every role above it, for example `/safety` for Team Lead and above in the appeals server), the protected servers (where the bot registers no commands and global bans never apply, such as the appeals server), the role and log channel for global bans, and the list of servers a global ban applies to, and the minimum account age in days for each server that kicks new accounts.

## Deployment

Every push to `main` runs the typecheck in GitHub Actions. The production VM checks `main` every two minutes, type-checks new commits in a staging copy and deploys them if that passes. The files for that are in `deploy/`.

## Credits

Icons are from [Papicons](https://github.com/PapillonApp/Papicons), MIT licensed.
