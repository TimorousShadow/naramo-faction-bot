# TimorousShadow
set -eu
APP=/opt/naramo-faction
STAGE=/var/lib/naramo/stage
REPO=TimorousShadow/naramo-faction-bot
as_app() { runuser -u naramo -- "$@"; }

cd "$APP"
as_app git fetch --quiet origin main
current=$(as_app git rev-parse HEAD)
target=$(as_app git rev-parse origin/main)
[ "$current" = "$target" ] && exit 0
[ -f "$STAGE.failed" ] && [ "$(cat "$STAGE.failed")" = "$target" ] && exit 0

remote=$(curl -fsS -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$REPO/commits/$target/check-runs?check_name=typecheck" \
  | jq -r '[.check_runs[] | select(.status == "completed") | .conclusion] | if any(. == "failure") then "failure" else "ok" end' || echo ok)
if [ "$remote" = "failure" ]; then
  echo "GitHub CI failed for $target"
  echo "$target" > "$STAGE.failed"
  exit 0
fi

[ -d "$STAGE/.git" ] || as_app git clone --quiet "https://github.com/$REPO.git" "$STAGE"
as_app git -C "$STAGE" fetch --quiet origin main
as_app git -C "$STAGE" reset --hard --quiet "$target"
if ! as_app sh -c "cd $STAGE && npm ci --no-audit --no-fund >/dev/null && npm run typecheck"; then
  echo "Typecheck failed for $target, not deploying"
  echo "$target" > "$STAGE.failed"
  exit 0
fi

echo "Deploying $target"
as_app git reset --hard --quiet "$target"
as_app npm ci --no-audit --no-fund
as_app sh -c ". /etc/naramo-faction.env && export DISCORD_TOKEN DISCORD_APPLICATION_ID GUILD_ID && npm run register"
systemctl restart naramo-faction
echo "Deployed $target"
