---
'@jsprismarine/client': patch
---

Answer the server's `ShowCredits Start` with `Finished` at once, the skip, so a headless client
leaving the End is not held on a credits screen it cannot roll. The client emits `credits` after
the answer and decodes the packet through a typed `showCreditsPacket` codec.
