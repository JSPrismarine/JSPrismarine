---
'@jsprismarine/prismarine': patch
---

Run each vanilla mob's AI goals with the arguments its Java class passes them (ADR 0024). A zombie looks at players 8 blocks away, not 6. A cow panics at twice its speed and is tempted from 10 blocks. A drowned targets villagers and iron golems, and a pet that follows its owner teleports once the owner is 12 blocks away, panicking or not.
