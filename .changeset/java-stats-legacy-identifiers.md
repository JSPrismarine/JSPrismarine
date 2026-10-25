---
'@jsprismarine/entities': patch
---

Reach Java's stats for the five entities the pack still names the way Bedrock used to.

`javaAttributeBases` looked an entity up in Java's attribute table by the identifier it spawned under, and that table is keyed by Java's names. Five of the 93 types it holds are a Bedrock entity that kept its older identifier: the evoker spawns as `evocation_illager`, the villager and zombie villager as `villager_v2` and `zombie_villager_v2`, the tropical fish as `tropicalfish` and the zombified piglin as `zombie_pigman`. None of them found their row, so the stat decision never applied to any of them. Two showed it in a value an operator can see: Bedrock's evoker followed from 64 blocks where Java's follows from 12, and Bedrock's villager from 128 where Java's follows from 16.

The lookup now goes through `javaEntityTypeToBedrock` from `@jsprismarine/mapping`, which owns the Java to Bedrock identifier seam, so the renames are read off that table rather than copied here. A Bedrock identifier several Java types map onto, such as the one every boat variant lands on, is left alone, because there is no single Java row to take. `javaEntityStats` is exported for a caller that needs the row itself.

The corpus test used to walk the Java table by name and skip anything the Bedrock registry did not have under that name, which is why it could not see this. It now resolves each type the same way, so the comparison covers 438 stats rather than 423, and the five are no longer invisible to it.
