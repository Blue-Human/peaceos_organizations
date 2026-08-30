# timestamps/

`registry.ots` — an [OpenTimestamps](https://opentimestamps.org/) proof over
[`../registry.manifest`](../registry.manifest). It lets anyone prove that the
exact set of keys listed in the manifest existed no later than a certain point in
time, anchored in the Bitcoin blockchain — no trusted third party required.

## Regenerate

```sh
npm run anchor           # runs scripts/anchor.sh
```

Needs the OpenTimestamps client (kept out of this repo's dependencies on
purpose):

```sh
pipx install opentimestamps-client      # provides the `ots` command
```

`anchor` refuses to run if `registry.manifest` is stale — run
`npm run build-manifest` first.

## Upgrade (after Bitcoin confirms)

A fresh proof is "incomplete": it has calendar-server commitments but not yet a
Bitcoin block header. Minutes-to-hours later:

```sh
ots upgrade registry.ots
git commit -am "anchor: upgrade proof"
```

## Verify

```sh
ots verify -f ../registry.manifest registry.ots
```

The `-f` is needed because the proof was made over `registry.manifest` but the
proof file lives here as `registry.ots` (per the layout in AGENTS.md).

## Note

Verify (`core`) does **not** read this file. It exists for this registry's own
auditability. `git log` plus this anchor together are the integrity story.
