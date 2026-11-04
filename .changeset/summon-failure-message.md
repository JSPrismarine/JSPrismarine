---
'@jsprismarine/commands': patch
---

Report a failed `/summon` as "Unable to summon entity". It sent the error "Summoned new entity" when the pack did not declare the type, which read like a success.
