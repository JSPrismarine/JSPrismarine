---
'@jsprismarine/prismarine': patch
---

Tick a chunk's fluid where Java does instead of everywhere it borders air. A chunk that enters a world schedules the fluid ticks generation recorded for it and nothing else, so water Java leaves standing, such as the pools in a lush cave, no longer floods the cave and washes its plants away. Scheduled fluid ticks are saved with their chunk in Bedrock's `PendingTicks` record and scheduled again when it loads, so water that was still moving at a save keeps moving after a restart.
