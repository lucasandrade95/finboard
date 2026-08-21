#!/bin/bash
#
# Daily autonomous contributor for finboard.
# Runs headless Claude Code to implement the next roadmap slice, verifies the
# build, and pushes only if a new green commit was produced.
#
# Invoked by launchd (com.lucasandrade.finboard.daily). Safe to run manually.

set -uo pipefail

# launchd starts with a bare PATH — set the tools explicitly.
# node/npm live under nvm; pick the newest installed version.
NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
export PATH="${NODE_BIN:+$NODE_BIN:}/Users/lucasandrade/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO="/Users/lucasandrade/Workspace/projetos_pessoais/finboard"
DAILY="$REPO/.daily"
DATE="$(date +%F)"
LOG="$DAILY/run-$DATE.log"

mkdir -p "$DAILY"
exec >>"$LOG" 2>&1
echo "==================== $(date) : daily run start ===================="

cd "$REPO" || { echo "FATAL: repo not found"; exit 1; }

# 1. Sync with remote so the AI works on the latest state.
git fetch origin --quiet
git checkout main --quiet 2>/dev/null
git reset --hard origin/main --quiet

BEFORE="$(git rev-parse HEAD)"
echo "HEAD before: $BEFORE"

# 2. Let headless Claude implement one slice (it commits, it does NOT push).
#    Tool access is limited to the allowlist below; pushing stays in this wrapper.
claude -p "$(cat "$DAILY/prompt.md")" \
  --allowedTools "Bash,Edit,Write,Read,Glob,Grep" \
  || echo "WARN: claude exited non-zero"

AFTER="$(git rev-parse HEAD)"
echo "HEAD after:  $AFTER"

# 3. Nothing committed -> nothing to push.
if [ "$BEFORE" = "$AFTER" ]; then
  echo "No new commit produced today. Exiting without push."
  echo "==================== $(date) : daily run end (no-op) ===================="
  exit 0
fi

# 4. Safety net: independently verify the build before publishing.
echo "Verifying build before push..."
if npm ci --no-audit --no-fund >/dev/null 2>&1 && npm run verify >/dev/null 2>&1; then
  echo "Build green. Pushing..."
  if git push origin main; then
    echo "Pushed $AFTER"
  else
    echo "ERROR: push failed"
    exit 1
  fi
else
  echo "ERROR: verify is RED after commit. Rolling back local HEAD, NOT pushing."
  git reset --hard "$BEFORE" --quiet
  exit 1
fi

echo "==================== $(date) : daily run end (pushed) ===================="
