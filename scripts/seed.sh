#!/bin/sh
# Fills a running dev server with demo data through the API: two travelers, three trips, one shared.
# Usage: sh scripts/seed.sh [base url]   (default http://localhost:3000)
# Log in afterwards as maya@example.com / roadtrip1 (the organizer) or sam@example.com / roadtrip1.
set -e
BASE=${1:-http://localhost:3000}
A=$(mktemp) B=$(mktemp)
trap 'rm -f "$A" "$B"' EXIT

post() { curl -sf -b "$1" -c "$1" -H 'Content-Type: application/json' -d "$3" "$BASE/api$2"; }

post "$A" /auth/register '{"name":"Maya Chen","email":"maya@example.com","password":"roadtrip1"}' >/dev/null
post "$B" /auth/register '{"name":"Sam Okafor","email":"sam@example.com","password":"roadtrip1"}' >/dev/null

code=$(post "$A" /trips '{"origin":"Champaign, IL","destination":"Chicago","startDate":"2026-11-27","endDate":"2026-11-30"}' |
  sed -E 's/.*"inviteCode":"([A-Z0-9]+)".*/\1/')
post "$A" /trips '{"origin":"Champaign, IL","destination":"Nashville","startDate":"2027-01-08","endDate":"2027-01-11"}' >/dev/null
post "$B" /trips '{"origin":"Urbana, IL","destination":"Great Smoky Mountains","startDate":"2027-03-14","endDate":"2027-03-20"}' >/dev/null
post "$B" /trips/join "{\"code\":\"$code\"}" >/dev/null

echo "Seeded $BASE. Chicago trip invite code: $code"
