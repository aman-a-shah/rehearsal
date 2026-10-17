#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3.13 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
npm ci --prefix web
echo "Ready. Run npm run dev, then open http://127.0.0.1:5180"
