---
"@jsprismarine/prismarine": patch
---

Send protocol 2193 clients whole chunks again instead of a request-mode skeleton. A 2193 client asked to fetch its sub chunks never closed its loading screen in a world with more than one, so it could not join. Protocol 2225 clients keep request mode and are now told how many sub chunks they may fetch rather than the index of the last one, so a column that fills only its lowest sub chunk, like a flat world, no longer leaves them without a floor.
