#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/unpack.py
cd evaluation
npm ci
python3 -m pip install -r requirements-independent-backend.txt
npm run test:core
npm run contracts
node scripts/browser-parity.mjs
npm run audit
npm run evaluate
npm run controls
npm run orchestration
node scripts/episode-repair.mjs
python3 scripts/independent-backend.py
npm run ablation
cd ..
python3 scripts/fingerprints.py verify
