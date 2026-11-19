---
'@jsprismarine/packs': patch
'@jsprismarine/errors': patch
---

The mcdoc validator now gates `#[since]` and `#[until]` for a snapshot, pre-release or release candidate target as the release it builds toward, so a `26.4-snapshot-10` target validates against the 26.4 schema instead of dropping every gated field. A target release in none of those forms, such as `24w14a`, throws `UncomparableJavaRelease`.
