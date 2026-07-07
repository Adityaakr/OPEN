#!/bin/bash
# bte seal countdown in the macOS menu bar (SwiftBar / xbar plugin).
#
# setup:
#   1. brew install swiftbar   (or xbar)
#   2. copy this file into your plugin folder, keep the .30s.sh suffix
#      (the suffix is the refresh interval)
#   3. paste a seal link into the watch file:
#        mkdir -p ~/.config/bte
#        echo 'https://bte-explorer-production.up.railway.app/#/s/<condition>/<cthash>' > ~/.config/bte/watch
#
# the menu bar then shows the live countdown; when the seal reveals, the
# icon flips to open and clicking it opens the link.
set -u

CONF="$HOME/.config/bte/watch"

if [ ! -s "$CONF" ]; then
  echo "🔒 bte"
  echo "---"
  echo "no seal configured | color=gray"
  echo "paste a seal link into ~/.config/bte/watch"
  exit 0
fi

LINK=$(head -1 "$CONF" | tr -d '[:space:]')
ORIGIN=${LINK%%/#*}
REST=${LINK#*#/s/}
COND=${REST%%/*}

if [ -z "$ORIGIN" ] || [ "$REST" = "$LINK" ]; then
  echo "🔒 bte ?"
  echo "---"
  echo "watch file is not a seal link (expected .../#/s/<condition>/<cthash>) | color=red"
  exit 0
fi

JSON=$(curl -fsS -m 10 "$ORIGIN/v0/conditions/$COND" 2>/dev/null)
if [ -z "$JSON" ]; then
  echo "🔒 bte ?"
  echo "---"
  echo "coordinator unreachable at $ORIGIN | color=gray"
  echo "open the seal | href=$LINK"
  exit 0
fi

printf '%s' "$JSON" | python3 - "$LINK" <<'PY'
import json, sys, time

d = json.load(sys.stdin)
link = sys.argv[1]
status = d.get("status", "")
fires = d.get("fires_at")
now = int(time.time())

def short(secs: int) -> str:
    dd, rem = divmod(secs, 86400)
    hh, rem = divmod(rem, 3600)
    mm, ss = divmod(rem, 60)
    if dd: return f"{dd}d {hh}h"
    if hh: return f"{hh}h {mm}m"
    if mm: return f"{mm}m"
    return f"{ss}s"

if status == "revealed":
    print("🔓 revealed")
elif status == "frozen":
    print("🔓 opening…")
elif status == "stalled":
    print("🔒 stalled")
elif fires is not None:
    left = fires - now
    print(f"🔒 {short(left)}" if left > 0 else "🔒 firing now")
else:
    print("🔒 at block")

print("---")
if fires is not None:
    print(f"unlocks {time.strftime('%a %d %b, %H:%M', time.localtime(fires))}")
print(f"open the seal | href={link}")
sealed = d.get("real_count")
if sealed is not None:
    print(f"{sealed} sealed in this round | color=gray")
PY
