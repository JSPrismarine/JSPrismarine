---
'@jsprismarine/commands': minor
---

The slot verbs take what has slots and nothing else: `SlotTarget`, a block or an entity, which `DataTarget` now extends with the storage form. `setSlot`, `applyItemModifier` and `copySlots` take every target a line names instead of one, and `LootDestination`'s `replace` carries `targets`, so `/loot replace` rolls once for all of them as Java does. `setSlot` takes a `SlotWriteMode`, which adds Java's `fill` and `override` to Bedrock's `replace`, `destroy` and `keep`, and returns how many slots it wrote. `copySlots` takes the sources, the targets, the mode and the modifier in that order.

`/item replace|fill|override … from` takes a source of either kind under either target, named `source`, where it took only a source of the target's own kind under the target's argument name. `/item` reports Java's `Replaced N slot(s) on <target>`, and `/replaceitem` reports Bedrock's `Replaced <slot> slot <n> of <target> with <count> * <item>`, or that the slot was occupied when `keep` left it.
