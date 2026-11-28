---
'@jsprismarine/script-host': patch
---

Resolve a script import without an extension, such as `./close_open_vent`, to the `.js` file, as the Bedrock Dedicated Server does. A pack that imported that way failed with `Could not find module`.
