// SPDX-License-Identifier: Apache-2.0
// Shared helpers for the PeaceOS Transparency Registry tooling.
// Zero dependencies: Node 20+ built-ins only. Keep it that way (see AGENTS.md).

import { createHash, createPublicKey } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// The one path shape `core` resolves: keys/<org_id>/<key_id>.pub, raw 32 bytes.
// Confirmed against Blue-Human/peaceosv3 core/src/verify.ts checkOrgIdentity().
export const ED25519_PUBLIC_KEY_BYTES = 32;
export const ED25519_SECRET_KEY_BYTES = 64; // libsodium raw secret key — must never appear here.

// Stricter than core's assertSafePackageRef on purpose: a public registry earns
// hygiene by being more restrictive than the minimum core tolerates.
export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const MANIFEST_FILE = 'registry.manifest';
export const MANIFEST_FORMAT = '1';

// SPKI DER prefix for an Ed25519 public key (RFC 8410). Prepended to the raw 32
// bytes so Node can parse it; a parse failure means the bytes are not a
// well-formed Ed25519 public key.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Recursively list files under `dir`, returning repo-relative POSIX paths. */
export function walkFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        stack.push(abs);
      } else if (entry.isFile()) {
        out.push(relative(REPO_ROOT, abs).split(sep).join('/'));
      }
    }
  }
  return out.sort();
}

export function fileSize(relPath) {
  return statSync(join(REPO_ROOT, relPath)).size;
}

export function readBytes(relPath) {
  return readFileSync(join(REPO_ROOT, relPath));
}

export function readJson(relPath) {
  return JSON.parse(readFileSync(join(REPO_ROOT, relPath), 'utf8'));
}

/**
 * True when `bytes` is a syntactically well-formed Ed25519 public key: exactly
 * 32 bytes and parseable as an SPKI key. This matches what core enforces
 * (length === 32); the parse is a cheap extra guard against someone committing
 * DER/PEM/base64 text into a .pub file.
 */
export function isEd25519PublicKey(bytes) {
  if (bytes.length !== ED25519_PUBLIC_KEY_BYTES) return false;
  if (bytes.every((b) => b === 0)) return false; // not a real key
  try {
    createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, bytes]),
      format: 'der',
      type: 'spki',
    });
    return true;
  } catch {
    return false;
  }
}

/** Parse a key path into { orgId, keyId } or null if it is not keys/<org>/<key>.pub. */
export function parseKeyPath(relPath) {
  const m = /^keys\/([^/]+)\/([^/]+)\.pub$/.exec(relPath);
  if (!m) return null;
  return { orgId: m[1], keyId: m[2] };
}

// ---- private-key / secret-material detection (blacklist, whole repo) ----

// File extensions and basenames that carry private key / secret material.
const SECRET_EXTENSIONS = ['.key', '.pem', '.p12', '.pfx', '.priv', '.sk', '.seed', '.mnemonic', '.asc', '.gpg'];
const SECRET_BASENAMES = ['id_ed25519', 'id_rsa', 'id_ecdsa', 'id_dsa', 'keypair', 'secret', 'seed.txt'];

// PEM private-key banners (RSA/EC/OPENSSH/PKCS8/DSA all end "... PRIVATE KEY-----").
const PEM_PRIVATE_RE = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/;
// A lone line of >= 12 short lowercase words — a BIP39-style mnemonic. Scanned
// only in non-Markdown files, where such a line has no legitimate reason to be.
const MNEMONIC_RE = /^(?:[a-z]{3,8} ){11,}[a-z]{3,8}$/m;

/**
 * Inspect one file for private-key / secret material.
 * Returns an array of human-readable reasons (empty === clean).
 * `allow` is a set of repo-relative paths exempt from the binary-size heuristic
 * (e.g. the OpenTimestamps proof, which is opaque binary of arbitrary length).
 */
export function scanForSecrets(relPath, allow = new Set()) {
  const reasons = [];
  const lower = relPath.toLowerCase();
  const base = lower.split('/').pop();

  if (SECRET_EXTENSIONS.some((ext) => base.endsWith(ext))) {
    reasons.push(`filename looks like private-key material (extension of "${base}")`);
  }
  if (SECRET_BASENAMES.includes(base)) {
    reasons.push(`filename "${base}" is a well-known private-key filename`);
  }

  const bytes = readBytes(relPath);

  // A raw Ed25519 secret key from libsodium is exactly 64 binary bytes.
  const isPrintable = bytes.every((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127));
  if (bytes.length === ED25519_SECRET_KEY_BYTES && !isPrintable && !allow.has(relPath)) {
    reasons.push('file is exactly 64 opaque binary bytes — the size of a raw Ed25519 secret key');
  }

  // Text scan.
  const text = bytes.toString('utf8');
  if (PEM_PRIVATE_RE.test(text)) {
    reasons.push('contains a PEM "BEGIN ... PRIVATE KEY" banner');
  }
  if (!lower.endsWith('.md') && MNEMONIC_RE.test(text)) {
    reasons.push('contains a line that looks like a BIP39 seed phrase');
  }

  return reasons;
}
