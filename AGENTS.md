# AGENTS.md — PeaceOS Transparency Registry

> Context file for the AI agent working in the **transparency** repository.
> This is NOT the code monorepo. It is the public, append-only registry of
> organizational public keys. Written in English (repo operating language).

---

## What this repo is

The public registry that lets PeaceOS Verify answer one question: **"is the
organization that signed this package who it claims to be?"** Verify's
`org_identity` check resolves an organization's **public** key here. It is the
root of trust for organizational identity.

It lives in a separate repository on purpose: it must read as a clean,
append-only, auditable log — not mixed with development commits. Its integrity
comes from two things together: the **git history** (append-only) and
**OpenTimestamps** anchoring.

## Hard rules (non-negotiable)

1. **PUBLIC KEYS ONLY.** This repo contains only `.pub` files (raw Ed25519 public
   keys) and metadata. **Never** commit a private key, seed, mnemonic, or any
   secret. If you ever encounter private-key material, STOP and flag it.
2. **Never generate or handle private keys.** Key generation and private-key
   custody are done by a human, offline, with the code repo's `keygen`. Your job
   is scaffolding, tooling, validation and docs — not creating keys.
3. **Append-only.** Entries are added, never rewritten or deleted. Correcting or
   retiring a key is done with an **additive revocation record**, never by
   deleting files or rewriting git history. The history is the audit trail.
4. **The structure MUST match what `core` reads.** Verify's resolver reads the
   org public key at a specific path in this directory. If you can access the
   code repo, confirm the exact path and byte format against `core`'s
   `org_identity` resolver and `examples/transparency`; **those are
   authoritative**. A mismatch means Verify cannot resolve organizations and the
   whole registry is useless. Do not invent the format.
5. **No telemetry, no phone-home, no heavy build.** Static registry plus light,
   local tooling. Ask before adding any dependency.

## Expected structure

Based on what `core` resolves (confirm against the code repo before finalizing):

```
keys/<org_id>/<key_id>.pub            raw 32-byte Ed25519 public key
orgs/<org_id>/metadata.json           human-readable org info (name, contact, date added)
revocations/<org_id>/<key_id>.json    additive revocation record (date + reason), if needed
registry.manifest                     deterministic listing of every key + its sha256
timestamps/registry.ots               OpenTimestamps proof over registry.manifest
scripts/                              validate / build-manifest / anchor
README.md
CONTRIBUTING.md  (or GOVERNANCE.md)
```

- The `.pub` files are the exact bytes `core` expects (raw 32-byte Ed25519 keys —
  confirm). `registry.manifest` and `timestamps/` exist for anchoring and audit,
  not for `core`'s resolution: `core` reads the `.pub` directly by path.

## Tooling to build (light, no heavy deps)

- **validate** — checks that: the structure is correct; every `.pub` is a valid
  32-byte Ed25519 public key; **no private-key material exists anywhere** in the
  repo; `registry.manifest` matches the keys on disk; metadata is well-formed.
- **build-manifest** — regenerates `registry.manifest` deterministically (sorted
  entries; each = `org_id/key_id` + `sha256` of the `.pub`).
- **anchor** — OpenTimestamps stamp over `registry.manifest` → `timestamps/registry.ots`.
- **CI (GitHub Actions)** — run `validate` on every pull request; fail the build
  if any private-key-looking material is present or the structure/manifest breaks.

## Workflow for adding an organization (put in CONTRIBUTING)

1. The organization generates its keypair with the code repo's `keygen` (human,
   offline). It keeps the **private** key safe and never shares it.
2. It opens a pull request adding `keys/<org_id>/<key_id>.pub` (public only) and
   `orgs/<org_id>/metadata.json`.
3. A maintainer verifies, out-of-band, that the key really belongs to that
   organization, reviews the PR, and runs `validate`.
4. On merge, run `build-manifest` + `anchor` and commit the updated manifest and
   `.ots`.

## Governance (note now, refine later)

This registry is the root of trust for organizational identity, so treat changes
with the same seriousness as security-critical code. Define and document: who may
approve keys, how ownership of a key is verified before it is added, and how a
compromised key is revoked (additive record, and how Verify should treat it).
Start with maintainer review via PRs; write the process down in GOVERNANCE.

## What NOT to do

- Never generate, request, store, or commit private keys.
- Never delete files or rewrite git history to "fix" an entry — add a correction
  or revocation record instead.
- Never merge this registry into the code monorepo.
- Never add heavy dependencies without asking.
- Never invent the key path or byte format — match `core`.

## Definition of done

The repo is scaffolded with the exact structure `core` expects; `validate`,
`build-manifest` and `anchor` work; CI validates every PR and blocks private-key
material; README and CONTRIBUTING/GOVERNANCE are written; and there is one worked
example entry that uses a **public** test key only (never a real private key).