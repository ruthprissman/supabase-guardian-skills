#!/usr/bin/env bash
# install.sh — Supabase Guardian Skills installer (Mac / Linux)
# Copies the three skills into your Claude Code skills folder.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/skills"
TARGET="$HOME/.claude/skills"

echo ""
echo "Installing Supabase Guardian skills..."
echo "  From: $SRC"
echo "  To:   $TARGET"
echo ""

if [ ! -d "$SRC" ]; then
  echo "ERROR: skills folder not found next to this script." >&2
  exit 1
fi

mkdir -p "$TARGET"

for dir in "$SRC"/*/; do
  name="$(basename "$dir")"
  dest="$TARGET/$name"
  if [ -d "$dest" ]; then
    echo "  ~ $name already exists - overwriting"
    rm -rf "$dest"
  fi
  cp -r "$dir" "$dest"
  echo "  + $name"
done

echo ""
echo "Done. Restart Claude Code to load the new skills."
echo ""
