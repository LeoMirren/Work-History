#!/usr/bin/env bash
# SessionStart hook. Lives in each repo at .claude/agent-kit/ensure.sh.
# Installs the agent kit stored in this repo into ~/.claude when this device
# has no kit, or an older one. Does nothing otherwise. Never blocks a session.
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || exit 0
zip="$dir/agent-kit-v2.zip"
[ -f "$zip" ] || exit 0
want="$(tr -cd '0-9' < "$dir/VERSION" 2>/dev/null)"
[ -n "$want" ] || exit 0
dest="${KIT_DEST:-$HOME/.claude}"
have=""; [ -f "$dest/agent-kit.version" ] && have="$(tr -cd '0-9' < "$dest/agent-kit.version")"
[ "${have:-0}" -ge "$want" ] 2>/dev/null && exit 0

tmp="$(mktemp -d 2>/dev/null)" || exit 0
trap 'rm -rf "$tmp"' EXIT
if command -v unzip >/dev/null 2>&1; then
  unzip -q -o "$zip" -d "$tmp" 2>/dev/null || exit 0
elif command -v python3 >/dev/null 2>&1; then
  python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$zip" "$tmp" 2>/dev/null || exit 0
else
  exit 0
fi
[ -f "$tmp/agent-kit-v2/install.sh" ] || exit 0
if KIT_DEST="$dest" bash "$tmp/agent-kit-v2/install.sh" > "$tmp/install.log" 2>&1; then
  echo "Agent kit $want was installed into $dest from this repo (previous: ${have:-none}). Replaced files are in $dest/backups/. The new global instructions and skills load fully from the next session."
fi
exit 0
