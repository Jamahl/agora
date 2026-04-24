#!/usr/bin/env bash
# Expose local API to the public internet so Retell webhooks can reach it.
# Uses cloudflared if available, else falls back to ngrok.
set -euo pipefail

PORT=${PORT:-8000}

if command -v cloudflared >/dev/null 2>&1; then
  echo "Starting cloudflared tunnel → http://localhost:${PORT}"
  cloudflared tunnel --url "http://localhost:${PORT}"
elif command -v ngrok >/dev/null 2>&1; then
  echo "Starting ngrok → http://localhost:${PORT}"
  ngrok http "${PORT}"
else
  echo "Install cloudflared (brew install cloudflared) or ngrok to expose the webhook URL." >&2
  exit 1
fi
