#!/bin/sh
# Fills a running dev server with demo data through the API: two travelers, three trips, one shared, with plans.
# Usage: sh scripts/seed.sh [base url]   (default http://localhost:3000)
# Log in afterwards as maya@example.com / roadtrip1 (the organizer) or sam@example.com / roadtrip1.
set -e
BASE=${1:-http://localhost:3000}
A=$(mktemp) B=$(mktemp)
trap 'rm -f "$A" "$B"' EXIT

post() { curl -sf -b "$1" -c "$1" -H 'Content-Type: application/json' -d "$3" "$BASE/api$2"; }

post "$A" /auth/register '{"name":"Maya Chen","email":"maya@example.com","password":"roadtrip1"}' >/dev/null
post "$B" /auth/register '{"name":"Sam Okafor","email":"sam@example.com","password":"roadtrip1"}' >/dev/null

chicago=$(post "$A" /trips '{"origin":"Champaign, IL","destination":"Chicago","startDate":"2026-11-27","endDate":"2026-11-30"}')
id=$(echo "$chicago" | sed -E 's/.*"id":"([^"]+)".*/\1/')
code=$(echo "$chicago" | sed -E 's/.*"inviteCode":"([A-Z0-9]+)".*/\1/')
post "$A" /trips '{"origin":"Champaign, IL","destination":"Nashville","startDate":"2027-01-08","endDate":"2027-01-11"}' >/dev/null
post "$B" /trips '{"origin":"Urbana, IL","destination":"Great Smoky Mountains","startDate":"2027-03-14","endDate":"2027-03-20"}' >/dev/null
post "$B" /trips/join "{\"code\":\"$code\"}" >/dev/null

plan() { post "$1" "/trips/$id/items" "$2" >/dev/null; }
plan "$A" '{"date":"2026-11-27","time":"09:00","title":"Drive up I-57","place":"","note":"About 2.5 hours. Coffee stop in Kankakee."}'
plan "$A" '{"date":"2026-11-27","time":"15:00","title":"Check in","place":"Hotel Julian, 168 N Michigan Ave","note":""}'
plan "$B" '{"date":"2026-11-28","time":"10:30","title":"Art Institute","place":"111 S Michigan Ave","note":"Free for students with ID."}'
plan "$B" '{"date":"2026-11-28","time":null,"title":"Deep dish for dinner","place":"","note":""}'
plan "$A" '{"date":"2026-11-29","time":"06:45","title":"Sunrise at Navy Pier","place":"600 E Grand Ave","note":""}'

echo "Seeded $BASE. Chicago trip invite code: $code"
