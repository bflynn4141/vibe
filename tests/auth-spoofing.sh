#!/usr/bin/env bash
set -euo pipefail

API_URL="${VIBE_API_URL:-http://localhost:3000}"
TMP_DIR="${TMPDIR:-/tmp}/vibe-tests"
mkdir -p "$TMP_DIR"

register_user() {
  local handle="$1"
  curl -sS -X POST "$API_URL/api/presence" \
    -H "Content-Type: application/json" \
    -d "{\"action\":\"register\",\"username\":\"$handle\"}"
}

extract_token() {
  node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);if(j.token){console.log(j.token);process.exit(0);}console.error("Missing token");process.exit(1);}catch(e){console.error("Invalid JSON");process.exit(1);}});'
}

handle_a="test_alice_$(date +%s)"
handle_b="test_bob_$(date +%s)"

echo "[auth] registering @$handle_a"
token_a="$(register_user "$handle_a" | extract_token)"

echo "[auth] attempting spoofed send (should fail)"
status_spoof="$(curl -sS -o "$TMP_DIR/spoof.json" -w "%{http_code}" \
  -X POST "$API_URL/api/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $token_a" \
  -d "{\"from\":\"$handle_b\",\"to\":\"$handle_a\",\"text\":\"spoof-test\"}")"

if [ "$status_spoof" != "403" ]; then
  echo "FAIL: spoofed send returned $status_spoof"
  cat "$TMP_DIR/spoof.json"
  exit 1
fi
echo "PASS: spoofed send blocked"

echo "[auth] valid send (should succeed)"
status_ok="$(curl -sS -o "$TMP_DIR/ok.json" -w "%{http_code}" \
  -X POST "$API_URL/api/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $token_a" \
  -d "{\"from\":\"$handle_a\",\"to\":\"$handle_b\",\"text\":\"auth-ok\"}")"

if [ "$status_ok" != "200" ]; then
  echo "FAIL: valid send returned $status_ok"
  cat "$TMP_DIR/ok.json"
  exit 1
fi

echo "PASS: auth spoofing test"
