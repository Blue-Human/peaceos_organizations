# org-recolectora — EXAMPLE FIXTURE, NOT A REAL ORGANIZATION

🚫 **Do not trust this entry. It is a test fixture.**

- The **private key** for `org-2026` is **public** — it ships in `examples/` of
  the [`Blue-Human/peaceosv3`](https://github.com/Blue-Human/peaceosv3) code
  repository, where anyone can read it. Anyone can forge this organization's
  countersignature.
- This entry exists for one reason: so the registry is non-empty and so the
  example packages in the code repo (`examples/packages/*.vep`) can be verified
  end to end against a real checkout of this registry.
- It is kept under the `org_id` `org-recolectora` (not a name like `test-org`)
  **only** so those example packages keep resolving — their manifests hard-code
  `org.org_id = "org-recolectora"`, `org.key_id = "org-2026"`. The "this is a
  toy" signal lives entirely in metadata, not in the name:
  [`metadata.json`](metadata.json) carries `"status": "example"`,
  `"trust": "example-fixture"`, `"not_a_real_organization": true`, and a
  `"warning"`. `registry.manifest` marks the line `example`.

Real organizations are added through the process in
[`../../CONTRIBUTING.md`](../../CONTRIBUTING.md), with a maintainer verifying key
ownership out of band. Nothing about this fixture went through that.

If this registry is ever used for real trust decisions and you want the fixture
gone, that is a coordinated change with the code repo (drop the example packages'
dependence on it first). Until then it stays, clearly labelled.
