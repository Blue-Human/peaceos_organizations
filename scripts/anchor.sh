#!/usr/bin/env sh
# SPDX-License-Identifier: Apache-2.0
# Anchor registry.manifest with OpenTimestamps -> timestamps/registry.ots
#
# Uses the OpenTimestamps client CLI (`ots`) so this repo keeps ZERO code
# dependencies. Install it once, out of band:
#
#   pipx install opentimestamps-client      # or: pip install --user opentimestamps-client
#
# Run this on merge, after `npm run build-manifest`, then commit the updated
# registry.manifest AND timestamps/registry.ots together (see GOVERNANCE.md).
#
# The proof is "incomplete" until the Bitcoin calendar servers fold it into a
# block (minutes to a few hours). Upgrade it later, out of band, with:
#
#   ots upgrade timestamps/registry.ots && git commit -am "anchor: upgrade proof"
#
# Verify anytime with:
#
#   ots verify -f registry.manifest timestamps/registry.ots
set -eu

cd "$(dirname "$0")/.."

if ! command -v ots >/dev/null 2>&1; then
  echo "error: 'ots' not found. Install: pipx install opentimestamps-client" >&2
  exit 1
fi

if [ ! -f registry.manifest ]; then
  echo "error: registry.manifest not found. Run: npm run build-manifest" >&2
  exit 1
fi

# Refuse to anchor a stale manifest.
node scripts/build-manifest.mjs --check

ots stamp registry.manifest
mkdir -p timestamps
mv registry.manifest.ots timestamps/registry.ots

echo "Wrote timestamps/registry.ots"
echo "Commit registry.manifest and timestamps/registry.ots together."
echo "Later: ots upgrade timestamps/registry.ots  (once Bitcoin confirms)"
