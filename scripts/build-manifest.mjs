#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Regenerate registry.manifest deterministically from the keys on disk.
//
//   node scripts/build-manifest.mjs            # write registry.manifest
//   node scripts/build-manifest.mjs --check    # exit 1 if it would change
//
// The manifest is the registry's own audit record of every key + its hash. It
// is NOT what `core` reads to resolve a key (core reads keys/<org>/<key>.pub
// directly); it exists so the whole key set can be hashed and anchored with
// OpenTimestamps in one shot. See AGENTS.md.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MANIFEST_FILE,
  MANIFEST_FORMAT,
  REPO_ROOT,
  isEd25519PublicKey,
  parseKeyPath,
  readBytes,
  readJson,
  sha256Hex,
  walkFiles,
} from './lib.mjs';

export function buildManifestText() {
  const keyFiles = walkFiles(join(REPO_ROOT, 'keys')).filter((p) => p.endsWith('.pub'));

  const rows = [];
  for (const relPath of keyFiles) {
    const parsed = parseKeyPath(relPath);
    if (!parsed) {
      throw new Error(`Not a valid key path: ${relPath} (run "npm run validate" for details)`);
    }
    const bytes = readBytes(relPath);
    if (!isEd25519PublicKey(bytes)) {
      throw new Error(`Not a 32-byte Ed25519 public key: ${relPath} (run "npm run validate")`);
    }
    const { orgId, keyId } = parsed;

    let status = 'active';
    try {
      status = readJson(`orgs/${orgId}/metadata.json`).status ?? 'active';
    } catch {
      throw new Error(`Missing or unreadable orgs/${orgId}/metadata.json for ${relPath}`);
    }

    const marker = status === 'example' ? ' example' : '';
    rows.push(`${orgId}/${keyId} ${sha256Hex(bytes)}${marker}`);
  }

  rows.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const header = [
    '# PeaceOS Transparency Registry — key manifest',
    `# format: ${MANIFEST_FORMAT}`,
    '# fields: <org_id>/<key_id> <sha256-of-raw-32-byte-.pub> [example]',
    '# Sorted by "<org_id>/<key_id>". Regenerate with: npm run build-manifest',
    '# This file is anchored by timestamps/registry.ots (npm run anchor).',
  ];
  return `${[...header, ...rows].join('\n')}\n`;
}

function main() {
  const check = process.argv.includes('--check');
  const text = buildManifestText();
  const path = join(REPO_ROOT, MANIFEST_FILE);

  if (check) {
    let current = '';
    try {
      current = readBytes(MANIFEST_FILE).toString('utf8');
    } catch {
      /* missing → treated as changed */
    }
    if (current !== text) {
      console.error(`${MANIFEST_FILE} is out of date. Run: npm run build-manifest`);
      process.exit(1);
    }
    console.log(`${MANIFEST_FILE} is up to date.`);
    return;
  }

  writeFileSync(path, text);
  console.log(`Wrote ${MANIFEST_FILE} (${text.trimEnd().split('\n').filter((l) => !l.startsWith('#')).length} key(s)).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    console.error(`build-manifest: ${err.message}`);
    process.exit(1);
  }
}
