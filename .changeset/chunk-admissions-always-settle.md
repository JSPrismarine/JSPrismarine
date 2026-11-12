---
"@jsprismarine/prismarine": patch
---

Settle every chunk completion the admission queue holds. A completion whose content throws while its digest is taken now rejects its caller instead of leaving the chunk load waiting, and the rest of the input step still applies. Under a replay trace, a recorded completion that was not ready at its tick is admitted at the first later step that holds it and reported as a divergence, rather than held for good.
