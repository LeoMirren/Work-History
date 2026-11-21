#!/usr/bin/env bash
# SessionStart hook. Lives in each repo at .claude/agent-kit/ensure.sh.
# Works wherever Claude Code can run bash: Linux, macOS, WSL, and Windows with Git Bash.
# Installs the agent kit stored in this repo into ~/.claude when this device
# has no kit, or an older one. Does nothing otherwise. Never blocks a session.
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || exit 0
zip="$dir/agent-kit-v2.zip"
[ -f "$zip" ] || exit 0
# Versions are exactly ten digits (YYYYMMDDNN). Anything else means "do not install".
ver() { v="$(head -c 32 "$1" 2>/dev/null | tr -d ' \r\n')"; case "$v" in [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]) printf '%s' "$v";; *) return 1;; esac; }
want="$(ver "$dir/VERSION")" || exit 0
home="${HOME:-${USERPROFILE:-}}"; [ -n "$home" ] || exit 0
dest="${KIT_DEST:-${CLAUDE_CONFIG_DIR:-$home/.claude}}"
have="none"
if [ -e "$dest/agent-kit.version" ]; then
  have="$(ver "$dest/agent-kit.version")" || exit 0   # unreadable stamp: leave the device alone
  [ "$have" -lt "$want" ] || exit 0
fi

tmp="$(mktemp -d 2>/dev/null)" || exit 0   # no private temp folder: do not install
trap 'rm -rf "$tmp"' EXIT
if command -v unzip >/dev/null 2>&1; then
  unzip -q -o "$zip" -d "$tmp" 2>/dev/null || exit 0
elif command -v python3 >/dev/null 2>&1; then
  python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$zip" "$tmp" 2>/dev/null || exit 0
elif command -v python >/dev/null 2>&1; then
  python -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$zip" "$tmp" 2>/dev/null || exit 0
else
  tar -xf "$zip" -C "$tmp" 2>/dev/null || exit 0   # bsdtar (macOS, Windows) reads zip files
fi
[ -f "$tmp/agent-kit-v2/install.sh" ] || exit 0
if KIT_DEST="$dest" bash "$tmp/agent-kit-v2/install.sh" > "$tmp/install.log" 2>&1; then
  printf '%s\n' "$want" > "$dest/agent-kit.version"
  echo "Agent kit $want was installed into $dest from this repo (previous: $have). Replaced files are in $dest/backups/. The new global instructions and skills load fully from the next session."
fi
exit 0
