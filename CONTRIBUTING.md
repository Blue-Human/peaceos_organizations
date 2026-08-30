# Contributing to the PeaceOS Transparency Registry

This registry is the **root of trust** for organizational identity in PeaceOS
Verify. Treat every change with the seriousness of security-critical code.

> **Never** put a private key, seed, mnemonic, or any secret in this repo or a
> pull request. Only `.pub` files (raw 32-byte Ed25519 **public** keys) and
> metadata belong here. CI rejects anything that looks like private-key material.

For **who** may approve, **how** ownership is verified, and the **revocation**
policy, see [GOVERNANCE.md](GOVERNANCE.md). This file is the mechanical how-to.

---

## Add a new organization

### 1. The organization generates its keypair — offline, itself

Using the code repo's CLI (`Blue-Human/peaceosv3`):

```sh
peaceos-verify keygen --out org-<year>
# writes org-<year>.pub  (32 bytes, public   — goes in the PR)
#        org-<year>.key   (64 bytes, private  — NEVER shared, NEVER committed)
```

The organization keeps `org-<year>.key` in its own secret storage. It never
leaves the organization — not to a maintainer, not into this repo, not into any
chat or email.

### 2. Choose identifiers

- `org_id` — stable, lowercase, `^[a-z0-9][a-z0-9-]*$` (e.g. `org-recolectora`).
  This never changes for the organization. Pick carefully.
- `key_id` — lowercase, same charset, unique within the org (e.g. `org-2026`).
  Convention: include the year so key rotation reads naturally.

These must match the `org.org_id` / `org.key_id` the organization will put in the
manifests it countersigns — Verify resolves `keys/<org_id>/<key_id>.pub` from
exactly those values.

### 3. Open a pull request adding two files

```
keys/<org_id>/<key_id>.pub       the .pub from step 1, byte-for-byte (32 bytes)
orgs/<org_id>/metadata.json      see the schema below
```

Do **not** add or edit `registry.manifest` or `timestamps/` — a maintainer
regenerates and re-anchors those on merge (step 6).

`metadata.json`:

```json
{
  "org_id": "<org_id>",
  "display_name": "Legal or well-known name of the organization",
  "status": "active",
  "homepage": "https://example.org",
  "contact": "security@example.org",
  "keys": [
    { "key_id": "<key_id>", "state": "active", "added": "YYYY-MM-DD" }
  ]
}
```

| Field | Rules |
| --- | --- |
| `org_id` | Must equal the directory name and match `^[a-z0-9][a-z0-9-]*$`. |
| `display_name` | Free text. The human-facing name. |
| `status` | `active` for a real organization. `example` only for test fixtures (requires a `warning` field — see the existing example). |
| `homepage`, `contact` | Recommended for real orgs; used for out-of-band ownership verification. May be `null`. |
| `keys[]` | One entry per `.pub` on disk for this org. `state` is `active` or `revoked`. `added` is an ISO date. |

### 4. Run validation locally

```sh
npm run validate
```

It must pass. A `notice:` that `registry.manifest` is stale is expected on an
add — the maintainer handles that on merge.

### 5. Maintainer: verify ownership out of band

Before approving, a maintainer independently confirms the key belongs to that
organization — see [GOVERNANCE.md](GOVERNANCE.md#verifying-ownership). This is the
step that actually makes the entry trustworthy; the tooling only checks shape.

### 6. Maintainer: merge, regenerate, anchor

```sh
npm run validate            # clean
npm run build-manifest      # refresh registry.manifest
npm run anchor              # registry.manifest -> timestamps/registry.ots
npm run validate:strict     # clean, including manifest + anchor
git add registry.manifest timestamps/registry.ots
git commit -m "registry: add <org_id>/<key_id>; rebuild manifest; anchor"
```

Later, once the Bitcoin attestation confirms:

```sh
ots upgrade timestamps/registry.ots
git commit -am "anchor: upgrade proof for <date>"
```

---

## Rotate a key (add a new one)

Rotation is just "add a new key" (steps 1–6) with the new `key_id`, plus a
`keys[]` entry in the existing `orgs/<org_id>/metadata.json`. Keep the old key's
`.pub` and entry in place. If the old key should no longer be used, also file a
revocation (below).

---

## Revoke a key

Revocation is **additive** — you never delete the `.pub` or rewrite history.

1. Add `revocations/<org_id>/<key_id>.json`:

   ```json
   {
     "org_id": "<org_id>",
     "key_id": "<key_id>",
     "revoked": "YYYY-MM-DD",
     "reason": "Why (e.g. suspected private-key compromise, key retired).",
     "replacement_key_id": "<new_key_id or omit>"
   }
   ```

2. In `orgs/<org_id>/metadata.json`, set that key's `"state": "revoked"`.
3. `npm run validate`, open a PR.
4. Maintainer merges, then `build-manifest` + `anchor` + `validate:strict`.

> **Known limitation:** the current `core` resolver checks only that
> `keys/<org_id>/<key_id>.pub` exists and is 32 bytes — it does **not** yet read
> `revocations/`. Until Verify consumes revocation records, a revoked key still
> resolves. Revocation today is a **published, timestamped, human-auditable
> signal** and the trigger for out-of-band notification to relying parties. See
> [GOVERNANCE.md](GOVERNANCE.md#revocation).

---

## What CI enforces on your PR

`node scripts/validate.mjs` plus an independent secret scan over the diff:

- **No private-key material** anywhere — by extension (`.key`, `.pem`, …), by
  content (PEM `BEGIN … PRIVATE KEY` banners), by size (64 opaque bytes), and by
  seed-phrase-looking lines.
- **`keys/` is a whitelist** — it may contain *only* `keys/<org_id>/<key_id>.pub`
  files that are exactly 32 bytes and parse as Ed25519 public keys. Any other
  file, extension, or size there fails the build.
- **Metadata** is well-formed and agrees with the keys on disk.
- **`registry.manifest`** is not internally broken (no wrong hashes, no entries
  for keys that do not exist).

A green check is necessary but **not sufficient** — a maintainer's out-of-band
ownership check is what makes an entry trustworthy.
