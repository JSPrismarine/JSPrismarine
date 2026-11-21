# Every entity keeps its items in one slot model

Status: accepted, 2026-11-21.

An entity's items live in one `EntityInventory` (`packages/prismarine/src/inventory/EntityInventory.ts`), whether the entity is a player or a mob. The inventory is a set of named `ItemContainer`s from a layout: a player has `inventory`, `armor`, `offhand`, `ender_chest` and `cursor`, and a mob has `mainhand`, `offhand`, `armor`, `body` and an `inventory` sized by its `minecraft:inventory` component. A slot holds an `Item` or nothing, and the item's own count is the slot's count. Equipment is a view over the containers: a player's main hand is the hotbar slot the hand slot names, and a mount's `body` can be an alias for one of its container slots, so a horse's armor is one stack.

Every write to a slot logs one `inventory-slot` change entry, `{entity, container, slot}` with the stack's saved form, and an undo restores it through the same path for players and mobs. Slot names from commands, Bedrock's `slot.*` groups and Java's `SlotRanges` names alike, are read in one place, `inventory/slotAddress.ts`, which resolves a name against one entity's inventory or a block's container.

## Considered options

Keeping three stores (`HumanInventory` for players, `MobBody` fields of `ContentItemDrop` records for mobs, and a flat identifier list for villager pickup) and adding a command adapter for each was the smallest fix for [#3567](https://github.com/JSPrismarine/JSPrismarine/issues/3567). It was rejected because every rule that reads items (commands, filters, combat, replication, scripts) already kept its own copy of the slot names, and those copies had drifted apart: `/loot replace … container.0` wrote main slot 9. A fourth adapter would have been one more copy.

Storing plain saved stacks in the slots and building `Item`s on demand would keep wire state such as stack network ids out of the world. It was rejected for now because about 50 files work with `Item` directly, and the network layer still identifies a stack by the `Item` it holds. [The plan](../plans/unified-item-slots.md) records it as an open question.

## Consequences

A mob's saved record keeps its `equipment`, `containerSlots` and `equipmentInventorySlots` keys in their old shapes, written from the inventory, so worlds saved before this decision still load. A mob's capacity is a logged field, and a shrink logs the slots it empties before the new size, so an undo restores the size first.

Replication sends a mob's equipment when a tick writes a slot one of its equipment slots reads, the same way it already tracked player slots. A new kind of slot, such as a chest boat's, is a container in a layout and a name in `slotAddress.ts`, and the commands, filters and saves that resolve names there reach it without further changes. `execute if items` does not yet: it reads its slots as an NBT path ([#3609](https://github.com/JSPrismarine/JSPrismarine/issues/3609)).
