#!/usr/bin/env bash
# install.sh — Supabase Guardian Skills installer (Mac / Linux)
# Copies the three skills into every detected agent's skills folder
# (Claude Code: ~/.claude/skills, Codex CLI: ~/.codex/skills — both read
# the same open SKILL.md format).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/skills"

if [ ! -d "$SRC" ]; then
  echo "ERROR: skills folder not found next to this script." >&2
  exit 1
fi

TARGETS=()
[ -d "$HOME/.claude" ] && TARGETS+=("$HOME/.claude/skills")
[ -d "$HOME/.codex" ] && TARGETS+=("$HOME/.codex/skills")

if [ ${#TARGETS[@]} -eq 0 ]; then
  echo "No existing ~/.claude or ~/.codex folder found — defaulting to Claude Code."
  TARGETS+=("$HOME/.claude/skills")
fi

echo ""
echo "Installing Supabase Guardian skills..."
echo "  From: $SRC"
echo ""

for TARGET in "${TARGETS[@]}"; do
  echo "  To:   $TARGET"
  mkdir -p "$TARGET"
  for dir in "$SRC"/*/; do
    name="$(basename "$dir")"
    dest="$TARGET/$name"
    if [ -d "$dest" ]; then
      echo "    ~ $name already exists - overwriting"
      rm -rf "$dest"
    fi
    cp -r "$dir" "$dest"
    echo "    + $name"
  done
  echo ""
done

echo "Done. Restart your agent (Claude Code / Codex) to load the new skills."
echo ""
