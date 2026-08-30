#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Validate the PeaceOS Transparency Registry.
//
//   node scripts/validate.mjs            # PR mode: structure + secrets + manifest correctness
//   node scripts/validate.mjs --strict   # release mode: also require manifest + timestamp current
//
// Exit 0 = clean, 1 = at least one error. Notices never fail the build.
//
// What this guards (AGENTS.md): no private-key material anywhere; the keys/
// tree contains ONLY well-formed 32-byte Ed25519 public keys at the exact path
// core resolves; metadata is well-formed; registry.manifest is not internally
// broken.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  ISO_DATE_RE,
  MANIFEST_FILE,
  REPO_ROOT,
  SLUG_RE,
  fileSize,
  isEd25519PublicKey,
  parseKeyPath,
  readBytes,
  readJson,
  scanForSecrets,
  sha256Hex,
  walkFiles,
} from './lib.mjs';
import { buildManifestText } from './build-manifest.mjs';

const STRICT = process.argv.includes('--strict');
const errors = [];
const notices = [];
const fail = (msg) => errors.push(msg);
const notice = (msg) => notices.push(msg);

// Files exempt from the "64 opaque bytes = secret key" size heuristic.
const SECRET_SCAN_ALLOW = new Set(['timestamps/registry.ots']);

const allFiles = walkFiles(REPO_ROOT);

// ---------------------------------------------------------------------------
// 1. No private-key / secret material anywhere in the repo.
// ---------------------------------------------------------------------------
for (const relPath of allFiles) {
  for (const reason of scanForSecrets(relPath, SECRET_SCAN_ALLOW)) {
    fail(`PRIVATE MATERIAL: ${relPath} — ${reason}`);
  }
}

// ---------------------------------------------------------------------------
// 2. keys/ is a WHITELIST: only keys/<org_id>/<key_id>.pub, 32-byte Ed25519.
//    Anything else under keys/ is rejected — a blacklist always misses a case.
// ---------------------------------------------------------------------------
const keyFiles = allFiles.filter((p) => p === 'keys' || p.startsWith('keys/'));
const keysByOrg = new Map(); // orgId -> Set<keyId>

for (const relPath of keyFiles) {
  const parsed = parseKeyPath(relPath);
  if (!parsed) {
    fail(`keys/ must contain only <org_id>/<key_id>.pub files — unexpected entry: ${relPath}`);
    continue;
  }
  const { orgId, keyId } = parsed;
  if (!SLUG_RE.test(orgId)) fail(`org_id "${orgId}" must match ${SLUG_RE} (${relPath})`);
  if (!SLUG_RE.test(keyId)) fail(`key_id "${keyId}" must match ${SLUG_RE} (${relPath})`);

  const size = fileSize(relPath);
  if (size !== 32) {
    fail(`${relPath} is ${size} bytes — a raw Ed25519 public key is exactly 32 bytes`);
    continue;
  }
  if (!isEd25519PublicKey(readBytes(relPath))) {
    fail(`${relPath} is 32 bytes but is not a well-formed Ed25519 public key`);
    continue;
  }
  if (!keysByOrg.has(orgId)) keysByOrg.set(orgId, new Set());
  keysByOrg.get(orgId).add(keyId);
}

// ---------------------------------------------------------------------------
// 3. Top-level layout.
// ---------------------------------------------------------------------------
for (const dir of ['keys', 'orgs']) {
  if (!existsSync(join(REPO_ROOT, dir))) fail(`missing required directory: ${dir}/`);
}

// ---------------------------------------------------------------------------
// 4. Per-org metadata.json.
// ---------------------------------------------------------------------------
const orgDirs = new Set(
  allFiles
    .filter((p) => p.startsWith('orgs/'))
    .map((p) => p.split('/')[1])
    .filter(Boolean),
);
for (const orgId of keysByOrg.keys()) orgDirs.add(orgId);

for (const orgId of [...orgDirs].sort()) {
  const metaPath = `orgs/${orgId}/metadata.json`;
  if (!existsSync(join(REPO_ROOT, metaPath))) {
    fail(`org "${orgId}" has keys but no ${metaPath}`);
    continue;
  }

  let meta;
  try {
    meta = readJson(metaPath);
  } catch (err) {
    fail(`${metaPath} is not valid JSON: ${err.message}`);
    continue;
  }

  if (meta.org_id !== orgId) fail(`${metaPath}: org_id "${meta.org_id}" must equal the directory name "${orgId}"`);
  if (!SLUG_RE.test(orgId)) fail(`${metaPath}: org_id "${orgId}" must match ${SLUG_RE}`);

  const status = meta.status ?? 'active';
  if (!['active', 'example'].includes(status)) {
    fail(`${metaPath}: status "${status}" must be "active" or "example"`);
  }
  if (status === 'example') {
    if (!(typeof meta.warning === 'string' && meta.warning.trim().length > 0)) {
      fail(`${metaPath}: status "example" requires a non-empty "warning" string (make it scream "do not trust")`);
    }
    if (meta.trust !== 'example-fixture') {
      fail(`${metaPath}: status "example" requires "trust": "example-fixture"`);
    }
    if (meta.not_a_real_organization !== true) {
      fail(`${metaPath}: status "example" requires "not_a_real_organization": true`);
    }
  }

  if (!Array.isArray(meta.keys) || meta.keys.length === 0) {
    fail(`${metaPath}: "keys" must be a non-empty array`);
    continue;
  }

  const metaKeyIds = new Set();
  for (const k of meta.keys) {
    if (!k || typeof k !== 'object') {
      fail(`${metaPath}: every "keys" entry must be an object`);
      continue;
    }
    if (!SLUG_RE.test(k.key_id ?? '')) fail(`${metaPath}: key_id "${k.key_id}" must match ${SLUG_RE}`);
    if (!['active', 'revoked'].includes(k.state ?? '')) {
      fail(`${metaPath}: key "${k.key_id}" state "${k.state}" must be "active" or "revoked"`);
    }
    if (!ISO_DATE_RE.test(k.added ?? '')) fail(`${metaPath}: key "${k.key_id}" "added" must be an ISO date (YYYY-MM-DD)`);
    metaKeyIds.add(k.key_id);

    const revPath = `revocations/${orgId}/${k.key_id}.json`;
    const revExists = existsSync(join(REPO_ROOT, revPath));
    if (k.state === 'revoked' && !revExists) {
      fail(`${metaPath}: key "${k.key_id}" is "revoked" but ${revPath} is missing`);
    }
    if (k.state !== 'revoked' && revExists) {
      fail(`${revPath} exists but ${metaPath} still lists key "${k.key_id}" as "${k.state}"`);
    }
  }

  const diskKeyIds = keysByOrg.get(orgId) ?? new Set();
  for (const keyId of diskKeyIds) {
    if (!metaKeyIds.has(keyId)) fail(`${metaPath}: keys/${orgId}/${keyId}.pub exists but is not listed in "keys"`);
  }
  for (const keyId of metaKeyIds) {
    if (!diskKeyIds.has(keyId)) fail(`${metaPath}: "keys" lists "${keyId}" but keys/${orgId}/${keyId}.pub is missing`);
  }
}

// ---------------------------------------------------------------------------
// 5. Revocation records (append-only: the .pub file is never removed).
// ---------------------------------------------------------------------------
for (const relPath of allFiles.filter((p) => p.startsWith('revocations/') && p.endsWith('.json'))) {
  const m = /^revocations\/([^/]+)\/([^/]+)\.json$/.exec(relPath);
  if (!m) {
    fail(`revocations/ must contain only <org_id>/<key_id>.json files — unexpected entry: ${relPath}`);
    continue;
  }
  const [, orgId, keyId] = m;
  let rev;
  try {
    rev = readJson(relPath);
  } catch (err) {
    fail(`${relPath} is not valid JSON: ${err.message}`);
    continue;
  }
  if (rev.org_id !== orgId) fail(`${relPath}: org_id "${rev.org_id}" must equal "${orgId}"`);
  if (rev.key_id !== keyId) fail(`${relPath}: key_id "${rev.key_id}" must equal "${keyId}"`);
  if (!ISO_DATE_RE.test(rev.revoked ?? '')) fail(`${relPath}: "revoked" must be an ISO date (YYYY-MM-DD)`);
  if (!(typeof rev.reason === 'string' && rev.reason.trim().length > 0)) {
    fail(`${relPath}: "reason" must be a non-empty string`);
  }
  if (!existsSync(join(REPO_ROOT, `keys/${orgId}/${keyId}.pub`))) {
    fail(`${relPath}: revocation is additive — keys/${orgId}/${keyId}.pub must stay in place, never be deleted`);
  }
}

// ---------------------------------------------------------------------------
// 6. registry.manifest — internal correctness always; currency only in --strict.
// ---------------------------------------------------------------------------
let expected = null;
try {
  expected = buildManifestText();
} catch (err) {
  // A fresh build can only fail because a key file is malformed — already
  // reported in full by section 2. Skip the manifest comparison rather than
  // crash on top of it.
  notice(`${MANIFEST_FILE} check skipped until key errors above are fixed (${err.message})`);
}

if (expected === null) {
  // nothing more to do
} else if (!existsSync(join(REPO_ROOT, MANIFEST_FILE))) {
  (STRICT ? fail : notice)(`${MANIFEST_FILE} is missing — run: npm run build-manifest`);
} else {
  const actual = readBytes(MANIFEST_FILE).toString('utf8');

  if (actual !== expected) {
    // Distinguish "broken" (wrong hash / phantom entry) from "stale" (a new key
    // not yet folded in). Broken always fails; stale is a notice unless --strict.
    const parseRows = (t) =>
      new Map(
        t
          .split('\n')
          .filter((l) => l && !l.startsWith('#'))
          .map((l) => {
            const [ref, hash] = l.split(' ');
            return [ref, hash];
          }),
      );
    const want = parseRows(expected);
    const have = parseRows(actual);
    let onlyStale = true;
    for (const [ref, hash] of have) {
      if (!want.has(ref)) {
        fail(`${MANIFEST_FILE}: lists "${ref}" but no such key exists on disk`);
        onlyStale = false;
      } else if (want.get(ref) !== hash) {
        fail(`${MANIFEST_FILE}: hash for "${ref}" does not match keys/${ref}.pub on disk`);
        onlyStale = false;
      }
    }
    const missing = [...want.keys()].filter((ref) => !have.has(ref));
    if (missing.length > 0) {
      (STRICT ? fail : notice)(
        `${MANIFEST_FILE} is stale — missing ${missing.length} key(s): ${missing.join(', ')}. Maintainer runs "npm run build-manifest" on merge.`,
      );
    }
    if (onlyStale && missing.length === 0 && actual !== expected) {
      (STRICT ? fail : notice)(`${MANIFEST_FILE} differs from a fresh build (formatting/sort). Run: npm run build-manifest`);
    }
  }

  // Cross-check: every manifest hash equals the on-disk file hash.
  for (const line of readBytes(MANIFEST_FILE).toString('utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [ref, hash] = line.split(' ');
    const keyPath = `keys/${ref}.pub`;
    if (existsSync(join(REPO_ROOT, keyPath))) {
      const actualHash = sha256Hex(readBytes(keyPath));
      if (actualHash !== hash) fail(`${MANIFEST_FILE}: "${ref}" hash ${hash} != sha256(${keyPath}) ${actualHash}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Timestamp anchor — required only in --strict.
// ---------------------------------------------------------------------------
if (STRICT && !existsSync(join(REPO_ROOT, 'timestamps/registry.ots'))) {
  fail('timestamps/registry.ots is missing — run: npm run anchor');
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
for (const n of notices) console.log(`notice: ${n}`);
for (const e of errors) console.error(`error:  ${e}`);

if (errors.length > 0) {
  console.error(`\nvalidate: FAILED with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(`\nvalidate: OK${notices.length ? ` (${notices.length} notice(s))` : ''}${STRICT ? ' [strict]' : ''}.`);
