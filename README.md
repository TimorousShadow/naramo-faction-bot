# Naramo Faction bot

Discord bot for the Naramo Faction Management server.

## Commands

`/banlist file:` bans every Discord user ID in a CSV. Only administrators can run it. The file can be one ID per line, or a table with a column named `id`, `user id` or `discord_id`. The bot shows what it found, skips accounts that are already banned, and waits for you to confirm. IDs that Excel rounded (like `1.42E+18`) are reported so you can export them again as text. It works in every server the bot is in.

`/globalban user: reason:` bans a user from every server the bot is in. It only exists in Naramo Faction Management and needs the Access role there. After confirmation, the bot bans the user in each server, reports what happened per server, and posts the result to the global ban log channel. It refuses to ban the person running it, the bot, a server owner or anyone with the Access role.

## Running it

Needs Node 24.

```sh
cp .env.example .env
npm ci
npm run register
npm start
```

`npm run icons:upload` uploads the icons in `assets/icons` as server emojis named `nf_<icon>` and writes their IDs to `src/emojis.json`. To render the icons again from the Papicons SVGs, set `PAPICONS_DIR` and run `npm run icons:build`.

## Deployment

Every push to `main` runs the typecheck in GitHub Actions. The production VM checks `main` every two minutes, type-checks new commits in a staging copy and deploys them if that passes. The files for that are in `deploy/`.

## Credits

Icons are from [Papicons](https://github.com/PapillonApp/Papicons), MIT licensed.
