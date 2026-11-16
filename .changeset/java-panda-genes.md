---
'@jsprismarine/entities': patch
'@jsprismarine/prismarine': patch
---

Draw a spawned panda's gene from Java's `Panda.Gene.getRandom` table, and let bred pandas and goats inherit from their parents: a panda takes one allele from each parent with a one in 32 mutation on each, and a goat kid takes the screaming of the parent it was picked from. `EntityInstance` gains `parents`, and a spawn can name the entities it was bred from.
