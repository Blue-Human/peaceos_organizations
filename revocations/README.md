# revocations/

Additive revocation records. One file per revoked key:

```
revocations/<org_id>/<key_id>.json
```

Adding a file here **records** that a key is revoked. It never removes anything —
the corresponding `keys/<org_id>/<key_id>.pub` stays in place (append-only), and
`orgs/<org_id>/metadata.json` marks that key `"state": "revoked"`.

## Schema

```json
{
  "org_id": "<org_id>",
  "key_id": "<key_id>",
  "revoked": "YYYY-MM-DD",
  "reason": "Non-empty free text — why the key is revoked.",
  "replacement_key_id": "<new key_id, or omit if none>"
}
```

`validate` checks: valid JSON; `org_id`/`key_id` match the path; `revoked` is an
ISO date; `reason` is non-empty; the `.pub` still exists; and
`orgs/<org_id>/metadata.json` lists the key as `revoked`.

## Important: Verify does not consume these yet

The current `core` resolver checks only that the `.pub` exists and is 32 bytes.
It does **not** read this directory, so a revoked key still resolves in Verify
today. Revocation here is a public, timestamped, human-auditable signal and the
trigger for out-of-band notification of relying parties. See
[../GOVERNANCE.md](../GOVERNANCE.md#revocation).
