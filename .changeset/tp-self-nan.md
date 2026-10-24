---
'@jsprismarine/prismarine': patch
---

Fix `/tp @s @s` and `/tp <you> <you>` sending the player to NaN, which the client showed as -2147483648 (#460).

A position argument now refuses anything that is not three finite numbers, so a selector or a player name can no longer be read as coordinates. `/tp 1 2 3` works again as well; the numbers used to be tried as a player name first. An entity also refuses to move to a position with a NaN or infinite coordinate, and whole coordinates in `/tp` land in the middle of the named block (`10` becomes `10.5`) instead of half a block short of it.
