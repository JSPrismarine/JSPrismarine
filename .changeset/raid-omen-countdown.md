---
'@jsprismarine/prismarine': patch
---

Start a raid 600 ticks after a player brings Bad Omen into a village, as Java 26.3 does: the Bad Omen turns into Raid Omen, and the raid starts where the player stood once the Raid Omen runs out. It started on the next 20-tick check. An omen whose player leaves or dies first lapses. `RaidParticipant` gains an optional `grantRaidOmen`.
