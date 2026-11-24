---
'@jsprismarine/prismarine': patch
---

A linked Java Edition and Xbox account can no longer play at once. A login on either edition replaces the other edition's session, which is told it logged in from another location: Bedrock clients get `LOGGED_IN_OTHER_LOCATION` and Java clients vanilla's `multiplayer.disconnect.duplicate_login`. A second Java login of the same account now replaces the first too, and a kicked Java player is disconnected with the reason instead of left connected.
