---
'@jsprismarine/prismarine': patch
'@jsprismarine/entity-goals': patch
---

Roll a panda's `gameplay/panda_sneeze` gift table on every sneeze, as Java's `Panda.afterSneeze` does, without Bedrock's extra 0.001 roll in front of it. A strider on land now walks to lava: `minecraft:behavior.move_to_liquid` searches on its first pass and then every 200 to 399 ticks, as Java's `MoveToBlockGoal` does, walks to the lava block itself, as `StriderGoToLavaGoal` does, and looks 7 blocks across and 2 up or down, Java's search range.
