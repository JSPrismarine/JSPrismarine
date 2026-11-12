---
"@jsprismarine/prismarine": patch
---

Send what a frozen tick's inputs did in that tick. Under `/tick freeze` the world held still and sent nothing, so an arm swing, a sound, an emote or a walk reached nobody until the unfreeze, and every occurrence of the freeze then went out at once. A world the ticker does not update now closes its tick with `World.closeTick`, which seals it and runs replication alone: the world's simulation and its clock stay still, and the players' actions reach the other clients as they do in a running tick.
