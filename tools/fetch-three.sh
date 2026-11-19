#!/usr/bin/env sh
# Downloads Three.js r128 into lib/three.min.js (run once if you want to play locally / offline).
set -e
mkdir -p "$(dirname "$0")/../lib"
curl -fsSL https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js -o "$(dirname "$0")/../lib/three.min.js"
echo "Saved lib/three.min.js ($(wc -c < "$(dirname "$0")/../lib/three.min.js") bytes)"
