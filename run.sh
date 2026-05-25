#!/bin/bash
# Quanta — run from repo root
# Ollama must be running first: ollama serve
#
# Engram (Telegram bot): set your bot token here once.
# Create the bot via @BotFather in Telegram, paste the token below.
# Leave blank to disable Engram.
#
# Load secrets from .env (never committed to git)
if [ -f "$(dirname "$0")/.env" ]; then
  set -a && source "$(dirname "$0")/.env" && set +a
fi

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

# Attach to (or create) the 'enigma' zellij session if not already inside it
if command -v zellij &>/dev/null && [ "${ZELLIJ_SESSION_NAME}" != "engram" ]; then
  exec zellij --session engram run -- bash "$REPO_DIR/run.sh"
fi

uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
