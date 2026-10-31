---
'@jsprismarine/prismarine': patch
---

Roll the end credits once on a player's first exit through the End's portal. The transfer waits
for the client's `ShowCredits Finished` reply, then runs the dimension change to the respawn
point as a respawn; a player who has seen the credits transfers at once. The flag persists as
Bedrock's `HasSeenCredits` on the player record, and Java's `seenCredits` tag is read as the
fallback.
