#!/bin/sh
# Checks create their own isolated users and trips. They never restart or seed the running server.
set -eu
cd "$(dirname "$0")/../.."
CHECK=${1:-scripts/browser/decline.cjs}
BASE=${BASE_URL:-http://localhost:3000}
if ! curl --silent --show-error --output /dev/null "$BASE/api/auth/me"; then
  echo "Start the local server with npm run dev before running browser checks."
  exit 1
fi
BASE_URL="$BASE" node "$CHECK"
