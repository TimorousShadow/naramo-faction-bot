# TimorousShadow
set -eu
APP=/opt/naramo-faction
REPO=TimorousShadow/naramo-faction-bot
as_app() { runuser -u naramo -- "$@"; }

cd "$APP"
as_app git fetch --quiet origin main
current=$(as_app git rev-parse HEAD)
target=$(as_app git rev-parse origin/main)
[ "$current" = "$target" ] && exit 0

state=$(curl -fsS -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$REPO/commits/$target/check-runs?check_name=typecheck" \
  | jq -r 'if .total_count == 0 then "pending" elif all(.check_runs[]; .conclusion == "success") then "success" elif any(.check_runs[]; .status != "completed") then "pending" else "failure" end')
if [ "$state" != "success" ]; then
  echo "Waiting on CI for $target: $state"
  exit 0
fi

echo "Deploying $target"
as_app git reset --hard --quiet "$target"
as_app npm ci --no-audit --no-fund
as_app sh -c ". /etc/naramo-faction.env && export DISCORD_TOKEN DISCORD_APPLICATION_ID GUILD_ID && npm run register"
systemctl restart naramo-faction
echo "Deployed $target"
