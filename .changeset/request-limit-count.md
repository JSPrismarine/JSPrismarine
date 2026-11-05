---
"@jsprismarine/prismarine": patch
---

Tell a client in sub chunk request mode how many sub chunks it may fetch rather than the index of the last one, so a column that fills only its lowest sub chunk, like a flat world, no longer leaves the client without its floor.
