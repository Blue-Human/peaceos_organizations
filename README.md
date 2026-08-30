# PeaceOS Transparency Registry

The public, append-only registry of **organizational public keys** for
[PeaceOS](https://github.com/Blue-Human/peaceosv3). It is the **root of trust**
for PeaceOS Verify's `org_identity` check.

When Verify inspects an evidence package (`.vep`), one question it answers is:
**"is the organization that countersigned this package who it claims to be?"**
It answers that by resolving the organization's public key **from this registry**
and checking the countersignature against it. Nothing else in this repo is a
trust anchor — just these public keys and their history.

## Why a separate repo

- It must read as a **clean, append-only, auditable log** — not interleaved with
  application commits.
- Its integrity rests on two things together:
  1. **git history** — entries are only ever *added*; nothing is rewritten or
     deleted (revocation is an *additive* record).
  2. **OpenTimestamps** — [`registry.manifest`](registry.manifest) is anchored
     to the Bitcoin blockchain via [`timestamps/registry.ots`](timestamps/), so
     the state of the key set at a point in time can be proven independently.

## Public keys only — never private keys

This repository contains **only** `.pub` files (raw 32-byte Ed25519 **public**
keys) and metadata. It must **never** contain a private key, seed, mnemonic, or
any other secret.

- Key generation and private-key custody are done by each organization, offline,
  with the code repo's `keygen`. The private key never leaves the organization.
- [`scripts/validate.mjs`](scripts/validate.mjs) and CI reject any file that
  looks like private-key material and fail the build.

If you ever find private-key material in this repo or a pull request: **stop, do
not merge, flag it to the maintainers, and treat that key as compromised.**

## Layout

```
keys/<org_id>/<key_id>.pub          the ONLY thing Verify reads — raw 32-byte Ed25519 public key
orgs/<org_id>/metadata.json         human-readable org info (name, contact, key states, dates)
revocations/<org_id>/<key_id>.json  additive revocation record (date + reason) — see revocations/README.md
registry.manifest                   deterministic list of every key + its sha256 (generated)
timestamps/registry.ots             OpenTimestamps proof over registry.manifest
scripts/                            validate · build-manifest · anchor
```

### How Verify resolves a key (the exact contract)

Confirmed against `core/src/verify.ts` → `checkOrgIdentity()` in the code repo.
Given a package whose manifest says `org.org_id = "X"` and `org.key_id = "Y"`,
Verify reads:

```
<local checkout of this repo>/keys/X/Y.pub
```

and requires it to be **exactly 32 raw bytes** — no base64, hex, PEM, or trailing
newline. If the file is missing or not 32 bytes, the check fails closed.

Verify reads **only** that `.pub` file. It does **not** consult
`registry.manifest`, `timestamps/`, `orgs/`, or `revocations/` — those exist for
this registry's own auditability and anchoring.

## Using this registry with Verify

Verification is fully offline. Clone this repo and point the CLI at it:

```sh
git clone https://github.com/Blue-Human/peaceos_organizations
peaceos-verify check ./some-package.vep --transparency ./peaceos_organizations
```

For a reproducible verification, pin to a commit whose `registry.manifest` you
have confirmed against `timestamps/registry.ots`.

## The example entry is NOT a trust anchor

`org-recolectora / org-2026` is a **test fixture**. Its private key is **public**
(it ships in `examples/` of the code repo). It exists only so the registry is
non-empty and so the example packages can be verified end to end. It is marked
`"status": "example"` in [its metadata](orgs/org-recolectora/metadata.json) and
`example` in `registry.manifest`. **Never treat it as a real organization.**

## Adding an organization / revoking a key

See [CONTRIBUTING.md](CONTRIBUTING.md) for the step-by-step, and
[GOVERNANCE.md](GOVERNANCE.md) for who approves keys, how ownership is verified,
and how a compromised key is handled.

## Tooling

Zero dependencies — Node 20+ built-ins only.

| Command | What it does |
| --- | --- |
| `npm run validate` | Structure + no private-key material + `registry.manifest` not internally broken. What CI runs on every PR. |
| `npm run validate:strict` | Also requires `registry.manifest` fully current and `timestamps/registry.ots` present. Run before/after a release. |
| `npm run build-manifest` | Regenerate `registry.manifest` deterministically from the keys on disk. |
| `npm run anchor` | OpenTimestamp `registry.manifest` → `timestamps/registry.ots`. Needs the `ots` CLI (`pipx install opentimestamps-client`). |

## License

Split on purpose:

- **Registry data** — `keys/`, `orgs/`, `revocations/`, `registry.manifest`,
  `timestamps/`, and the docs — is **[CC0-1.0](LICENSE)** (public domain
  dedication). This is an auditable public good; it should be as free to mirror,
  quote, and build on as possible.
- **Tooling** — everything under `scripts/` — is
  **[Apache-2.0](scripts/LICENSE)**, matching the code monorepo. Each script
  carries an `SPDX-License-Identifier: Apache-2.0` header.

Full texts are also in [`LICENSES/`](LICENSES/).
