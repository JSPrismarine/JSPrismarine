---
'@jsprismarine/prismarine': patch
---

An entity whose spawn the transport fails to frame is forgotten, so the next tracking pass sends it again instead of leaving it invisible. A failed spawn only forgets its own record: when the entity was dropped and shown again under the same runtime id before the failure arrived, the newer spawn stays tracked, so the removal that follows it still reaches the client.
