#!/usr/bin/env bash
#
# One-shot deploy for the Vaquill Google Docs add-on.
#
# Flow: preflight (node + clasp + login) -> ensure a Script ID (create one if
# missing) -> build the sidebar and GAS files -> clasp push. Idempotent: safe to
# re-run. The Script ID lives in the repo-root ./.clasp.json (gitignored), which
# survives the Vite build emptying dist/.
#
# Usage:
#   scripts/deploy.sh                       # build + push (creates a project on first run)
#   CLASP_SCRIPT_ID=<id> scripts/deploy.sh  # push to an existing Script ID
#   scripts/deploy.sh --no-push             # build only, skip clasp push
#
set -euo pipefail

# Resolve the extension root (parent of this script's dir), regardless of cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

CLASP_JSON="$ROOT_DIR/.clasp.json"
PLACEHOLDER_ID="YOUR_SCRIPT_ID_HERE"
DO_PUSH=1
[ "${1:-}" = "--no-push" ] && DO_PUSH=0

info() { printf '\033[0;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[0;33m!\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31mx\033[0m %s\n' "$1" >&2; exit 1; }

# Read the scriptId from ./.clasp.json without needing jq. Empty if unset.
read_script_id() {
  [ -f "$CLASP_JSON" ] || { echo ""; return; }
  node -e 'try{const c=require(process.argv[1]);process.stdout.write(c.scriptId||"")}catch{process.stdout.write("")}' "$CLASP_JSON" 2>/dev/null || echo ""
}

# ----------------------------------------------------------------------------
# 1. Preflight
# ----------------------------------------------------------------------------
info "Preflight checks"
command -v node >/dev/null 2>&1 || fail "node not found. Install Node.js 20+ and retry."
command -v clasp >/dev/null 2>&1 || fail "clasp not found. Install it: npm install -g @google/clasp"

# clasp stores credentials at ~/.clasprc.json (global) or ./.clasprc.json (local).
if [ ! -f "$HOME/.clasprc.json" ] && [ ! -f "$ROOT_DIR/.clasprc.json" ]; then
  fail "clasp is not logged in. Run: npm run gas:login   (clasp login)"
fi

[ -d "$ROOT_DIR/node_modules" ] || { info "Installing dependencies"; npm install; }

# ----------------------------------------------------------------------------
# 2. Ensure a Script ID
# ----------------------------------------------------------------------------
CURRENT_ID="$(read_script_id)"

# An explicit CLASP_SCRIPT_ID always wins; seed a minimal ./.clasp.json so the
# build step can pick it up and rewrite it with the correct rootDir/pushOrder.
if [ -n "${CLASP_SCRIPT_ID:-}" ] && [ "${CLASP_SCRIPT_ID}" != "$CURRENT_ID" ]; then
  info "Using CLASP_SCRIPT_ID from the environment"
  printf '{\n  "scriptId": "%s",\n  "rootDir": "./dist/gas"\n}\n' "$CLASP_SCRIPT_ID" > "$CLASP_JSON"
  CURRENT_ID="$CLASP_SCRIPT_ID"
fi

if [ -z "$CURRENT_ID" ] || [ "$CURRENT_ID" = "$PLACEHOLDER_ID" ]; then
  warn "No Script ID yet. Creating a new standalone Apps Script project."
  # --rootDir keeps the generated .clasp.json pointing at dist/gas, matching the
  # build. clasp writes the new scriptId into ./.clasp.json.
  clasp create --type standalone --title "Vaquill for Docs" --rootDir ./dist/gas
  CURRENT_ID="$(read_script_id)"
  [ -n "$CURRENT_ID" ] && [ "$CURRENT_ID" != "$PLACEHOLDER_ID" ] \
    || fail "clasp create did not produce a Script ID. Check the clasp output above."
  info "Created project: $CURRENT_ID"
else
  info "Using existing Script ID: $CURRENT_ID"
fi

# ----------------------------------------------------------------------------
# 3. Build (regenerates ./.clasp.json with the correct rootDir + filePushOrder,
#    preserving the Script ID resolved above)
# ----------------------------------------------------------------------------
info "Building sidebar + GAS files"
npm run build:all

# ----------------------------------------------------------------------------
# 4. Push
# ----------------------------------------------------------------------------
if [ "$DO_PUSH" -eq 1 ]; then
  info "Pushing to Apps Script"
  clasp push -f
  info "Push complete."
else
  info "Skipped push (--no-push). Run 'npm run gas:push' when ready."
fi

# ----------------------------------------------------------------------------
# 5. Post-deploy reminders (things this script cannot do for you)
# ----------------------------------------------------------------------------
cat <<'NEXT'

Done. Remaining manual steps (one-time, per environment):

  1. Apps Script editor (npm run gas:open) -> Project Settings:
     attach a STANDARD Google Cloud project. Required for
     ScriptApp.getIdentityToken(); the default hidden GCP project is not enough.

  2. Backend: set GOOGLE_ADDON_CLIENT_ID to that GCP project's OAuth client id
     (the audience the backend verifies), then deploy the backend.

  3. Run the auth smoke test in DEPLOYMENT.md:
     open a Doc -> Extensions -> Vaquill -> settings gear -> Account
     should read "Signed in" with your email.

NEXT
