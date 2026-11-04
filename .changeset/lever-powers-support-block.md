---
'@jsprismarine/engine-systems': patch
---

Let a flipped lever power the block it hangs on. The signal code read a state named `attachment_face` that no Bedrock lever has, so every lever fell back to "down" and never powered a block resting on its support block. A lamp touching the lever lit, but a lamp on the lever's wall did not. It now reads `lever_direction`.
