---
'@jsprismarine/prismarine': patch
---

Queue the unsent chunks of a failed chunk batch again, a limited number of times, so a player standing still gets them without moving, and a dimension change no longer waits out its loading screen timeout. Chunks the batch had already sent are not sent twice.
