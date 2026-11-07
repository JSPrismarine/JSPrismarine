---
title: Versioning
group: Documents
category: Guides
---

# Package versioning

Choose a Changeset level for each affected package based on its current version in `package.json`.

| Current package version | Breaking change | Feature | Fix or performance improvement |
| --- | --- | --- | --- |
| Below `1.0.0` | `minor` | `patch` | `patch` |
| `1.0.0` or later | `major` | `minor` | `patch` |

Treat a change as breaking when existing users must change code or configuration to keep working.
Removing or renaming a public API and changing a supported format incompatibly are breaking changes.
Changes to public types or signatures are breaking when existing calls no longer type-check. Additive
capabilities are features. Fixes and performance improvements use `patch`.

When one change affects multiple packages, classify each package separately. The fixed group in
`.changeset/config.json` may propagate the highest required bump to its other members, but it does
not change how you classify the packages directly affected by the change.
