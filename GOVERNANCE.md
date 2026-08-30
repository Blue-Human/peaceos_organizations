# Governance — PeaceOS Transparency Registry

This registry is the root of trust for organizational identity in PeaceOS Verify.
A wrong entry here lets a package be attributed to an organization that did not
sign it. This document defines who may change it and how.

> **Status:** initial. This is deliberately a *simple, honest* transparency log
> (a public append-only git repo + OpenTimestamps), designed to migrate to a
> formal log (e.g. Sigstore/Rekor) if scale demands it. The process below is the
> starting point, to be tightened by the maintainers.

## Principles

1. **Public keys only.** No private keys, seeds, or secrets — ever. See
   [README](README.md#public-keys-only--never-private-keys).
2. **Append-only.** Entries are added, never rewritten or deleted. Corrections
   and revocations are *additive* records. The git history is the audit trail
   and must never be force-pushed or rebased.
3. **The structure matches what `core` reads.** `keys/<org_id>/<key_id>.pub`,
   raw 32 bytes. Changing this shape is a breaking change to Verify and requires
   a coordinated change in the code repo first.
4. **Every state change is timestamped.** `registry.manifest` is re-anchored with
   OpenTimestamps on every merge that changes the key set.
5. **Trust comes from out-of-band verification, not from CI.** The tooling checks
   *shape*. A human maintainer checks *ownership*.

## Roles

| Role | Who | Can |
| --- | --- | --- |
| **Maintainer** | Named in `CODEOWNERS` (to be added). Minimum two. | Review and merge PRs, run `build-manifest` + `anchor`, publish revocations. |
| **Contributor** | Anyone, typically on behalf of an organization. | Open PRs adding a `.pub` + metadata, or adding a revocation record. |
| **Relying party** | Journalists, investigators, courts, integrators. | Read and audit. Pin to a commit; verify the anchor. |

Decisions that change policy (this file), the layout, or the maintainer set
require agreement of **all** current maintainers, recorded in the PR.

## Branch protection (required setup)

- `main` requires a pull request with **at least one maintainer approval**
  (two for a first-time organization).
- The `validate` status check must pass.
- **No force-push, no branch deletion, linear history**, admins included.
- Tags/releases, if used, are signed by a maintainer.

## Adding an organization

Mechanics: [CONTRIBUTING.md](CONTRIBUTING.md#add-a-new-organization).

### Verifying ownership

Before approving a **first key for an organization**, a maintainer must confirm,
through at least **two independent channels**, that the key belongs to that
organization and that the request is authorized. Acceptable channels include:

- A challenge string (the PR's head commit SHA) published at a well-known
  location the organization controls: `https://<homepage>/.well-known/peaceos-transparency.txt`,
  a DNS `TXT` record, or a post from an official account.
- Direct contact with a known representative using contact details obtained
  **independently** of the PR (not an address supplied in the PR).
- For established orgs: countersignature of the challenge by an already-trusted
  key, plus one human channel.

The maintainer records in the PR **which** channels were used and **who**
verified. Two maintainers must sign off for a first-time organization.

Key **rotations** for an already-verified org need one maintainer approval and
one confirmation channel (ideally a challenge countersigned by the org's current
active key).

## Revocation

Trigger a revocation when a private key is known or suspected to be compromised,
when a key is retired, or when an entry was added in error (the erroneous `.pub`
stays; the revocation explains it).

Process:

1. Anyone may open the revocation PR (mechanics in
   [CONTRIBUTING.md](CONTRIBUTING.md#revoke-a-key)). For a suspected compromise,
   a maintainer opens it immediately without waiting for the organization.
2. One maintainer approval merges it (compromise revocations are
   fast-tracked — bias toward publishing).
3. Maintainer runs `build-manifest` + `anchor` so the revocation is itself
   timestamped.
4. Maintainer notifies known relying parties out of band and, if the
   organization has a replacement key, fast-tracks adding it.

### Current enforcement gap

`core` does not yet read `revocations/`. Until it does, a revoked key still
resolves in Verify. Revocation is therefore, for now:

- a **public, timestamped, auditable** statement that a key is no longer valid
  from a given date, and
- the trigger for **out-of-band notification** of relying parties.

Closing this gap (Verify consulting revocation records and reporting a package
countersigned by a key revoked *before* the package's timestamp as
`problems_detected`) is tracked in the code repo and is the intended next step.

## Auditing this registry

Anyone can and should:

```sh
git clone https://github.com/Blue-Human/peaceos_organizations
cd peaceos_organizations
npm run validate:strict
ots verify -f registry.manifest timestamps/registry.ots
git log --stat        # every entry, when it was added, by whom
```

Report suspected bad entries or leaked private material to the maintainers
immediately; do not open a public issue that amplifies a leak.

## License

Decided:

- **Registry data** (`keys/`, `orgs/`, `revocations/`, `registry.manifest`,
  `timestamps/`, docs) — **CC0-1.0**. See [`LICENSE`](LICENSE). The registry is
  an auditable public good; the data carries no usage restrictions.
- **Tooling** (`scripts/`) — **Apache-2.0**, matching the code monorepo. See
  [`scripts/LICENSE`](scripts/LICENSE); each script has an SPDX header.

Full texts also in [`LICENSES/`](LICENSES/). Changing either license is a
policy change (needs all maintainers).
