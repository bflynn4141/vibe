#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Running auth spoofing test..."
bash "$ROOT_DIR/tests/auth-spoofing.sh"

echo "Running concurrency test..."
node "$ROOT_DIR/tests/concurrency.js"

echo "Running bridge cursor test..."
node "$ROOT_DIR/tests/bridge-cursor.js"

echo "All light tests passed."
