---
'@jsprismarine/errors': patch
---

Each error class now exposes its static `code`, `domain`, `module`, `template` and `docs` as getters instead of static fields. The values and their literal types are unchanged. Bun's AOT compiler counted each static field as a property added by name, about 6,000 across the catalog.
