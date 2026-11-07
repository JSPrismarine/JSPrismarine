---
'@jsprismarine/prismarine': patch
---

Stop holding every later change of world behind a respawn in another dimension. The client closes no loading screen for it, so the change stayed pending for a minute and a `/tp` or `/execute in <dimension> run tp @s` after dying elsewhere did nothing. `/kill` on a player who is already dead no longer takes them out of the world.
