---
'@jsprismarine/loot': patch
---

Index the host's recipes once per content options object instead of once per roll.

A loot context carries a content view, and the view has to close over the context it is attached to, so `LootRegistry.roll` builds a fresh one every call. Building one re-indexed every recipe the host had registered, which `furnace_smelt` is the only thing that reads. Over Java's vanilla datapack that walk costs far more than the roll it serves: 421545 draws over the 175 predictable tables took 543 s, against 1.9 s for the same draws with one context per table. Block drops, mob drops and `/loot` all roll through this path.

The index is derived from the recipes and the tag expander alone, so it is now built on first use and cached against the options object that carries them, the way Java's recipe manager indexes once per reload. A host that reloads its recipes hands over the new ones in a new options object, which is what loading a pack stack produces. The same workload now takes 2.5 s, and the draws are unchanged: identical stacks in identical order from the same world seed.
