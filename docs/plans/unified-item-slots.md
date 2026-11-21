# One item slot model, and command storage

Started 2026-11-21 for [#3567](https://github.com/JSPrismarine/JSPrismarine/issues/3567). The
issue reports two garbled command refusals. The cause behind both is that commands could reach a
player's slots and nothing else, and `/data` had no NBT to read. This plan gives every entity one
slot model, puts every slot name behind one parser, and adds Java Edition's command storage.

## What we know

Facts gathered on 2026-11-21, before any slice landed.

### Three slot stores

- **Players** keep `HumanInventory` (`inventory/HumanInventory.ts`). It extends `Inventory`, a map
  of `ContainerEntry`, and owns three more `Inventory`s (armor 4, offhand 1, ender chest 27), a
  cursor `Item`, a hand slot and a stack network id counter.
  - A `ContainerEntry` holds an `Item` and a count, and the `Item` holds a count too. About 20
    sites pick one or the other, and `ItemStackRequestHandler.itemOrNull` writes the entry's
    count onto the live item to bring them back in step.
  - An empty slot holds an air `Item`.
  - Each write logs one `inventory-slot` change entry, addressed `{entity, container, slot}`.
    Undo restores through `HumanInventory.restoreSlot`.
  - About 50 source files and 43 test files use these classes.
- **Mobs** keep three logged fields on `MobBody` (`entity/data/DataEntity.ts`), each holding
  `ContentItemDrop` records:
  - `equipment`, keyed `mainhand`, `offhand`, `head`, `chest`, `legs`, `feet` and `body`;
  - `containerSlots`, the `minecraft:inventory` container;
  - `inventory`, a flat list of identifiers with no counts, which villager pickup writes.

  `equipmentInventorySlots` maps an equipment slot to a container index, so a horse's armor is
  stored twice, once in its container and once in `equipment.body`. Each write logs the whole
  field. The record saves the same four fields as JSON in the actor's `jsprismarine:entity` tag.
- **Blocks** keep their slots in the block entity. `inventory/containerStore.ts` reads them for a
  screen or a command.

### Slot names are parsed in many places

Each of these keeps its own table: `command/host/inventory.ts` and `command/host/loot.ts`
(commands), `entity/equipment.ts`, `entity/data/EntityRuntime.ts` (`COMPONENT_EQUIPMENT_SLOTS`),
`entity/data/live.ts` and `entity/data/filterView.ts` (filter domains), `item/actorPort.ts`,
`packages/items/src/projection.ts`, and `packages/entities` (`hooks.ts`, `sensors.ts`,
`hazards.ts`). They have already drifted apart. `/loot replace … container.0` writes main slot 9,
because `loot.ts` maps Java's `container` to Bedrock's `slot.inventory`, which starts after the
hotbar.

### Commands

- `/replaceitem` and `/loot replace` reach players and blocks. A mob target reaches
  `unsupported("item slots on anything but a player, which this server's inventories")`, which
  prints the garbled sentence in the issue.
- No command path sends a storage target to `setSlot`. The NBT storage refusal there is
  unreachable from the command tree.
- Every NBT-by-path verb (`getData`, `countData`, `mergeData`, `modifyData`, `removeData`)
  refuses for every target. `execute store … storage` passes a bare number with no type suffix.
  `execute store … bossbar` writes into a storage named `bossbar/<id>` instead of the boss bar.
  `/function … with` is missing.

## Decisions

1. **A slot holds an `Item` or nothing.** The count lives on the `Item` alone. `ContainerEntry`
   and the air placeholder go. Code that needs air on the wire builds it at the wire.
2. **One container class.** `ItemContainer` replaces `Inventory`. It has a fixed size, which an
   owner can change (a llama's capacity follows its strength). Each `set` replaces the item and
   reports `before` and `after` to one observer.
3. **One inventory per entity.** `EntityInventory` holds named containers from a layout:

   | Container     | Player             | Mob                              |
   | ------------- | ------------------ | -------------------------------- |
   | `inventory`   | 36, hotbar first   | the `minecraft:inventory` size   |
   | `armor`       | 4                  | 4                                |
   | `body`        | none               | 1                                |
   | `offhand`     | 1                  | 1                                |
   | `mainhand`    | none, the hand slot names an `inventory` slot | 1     |
   | `ender_chest` | 27                 | none                             |
   | `cursor`      | 1                  | none                             |

   Equipment is a view over the containers: `equipment('mainhand')` reads the hand slot for a
   player and `mainhand` for a mob. A mount's equippable slots are aliases. `equipment('body')`
   on a horse reads its container slot, rather than a second copy of the stack. The crafting
   grid keeps `CraftingInput`, which already stores `Item | null` and logs per slot.
4. **One change entry kind.** Mob slots log `inventory-slot` entries the way player slots do, and
   undo restores them through the same path. The whole-field `equipment`, `containerSlots` and
   `inventory` entries go. The alias map stays a logged field.
5. **The saved form stays readable.** A mob's record keeps the `equipment`, `containerSlots` and
   `equipmentInventorySlots` keys, written from the inventory. A record's legacy `inventory`
   identifiers and `carried` load into the container and the main hand. Player records do not
   change.
6. **One slot name parser.** `inventory/slotAddress.ts` reads Bedrock groups with an index
   (`slot.hotbar 3`, `slot.saddle 0`, `slot.chest 2`) and Java slot names (`hotbar.3`,
   `container.12`, `armor.*`, `horse.saddle`, `horse.4`, `villager.2`, `player.cursor`,
   `contents`) into `{container, slot}` addresses on one entity's inventory or a block. Every
   other table in the server reads its equipment slot names from here.
7. **Command storage is per level, outside the change log.** `world/CommandStorage.ts` maps a
   resource location to an NBT compound, the way the scoreboard keeps plain data and logs
   nothing. The save writes it under the LevelDB key `jsprismarine:command_storage` as a compound
   of SNBT strings, since BDS has no such record and none of its tools read it.
8. **Typed NBT lives in `@jsprismarine/nbt`.** The tag model, SNBT and paths are in that package,
   where the binary codec already is.
9. **Entity and block NBT by path stay out.** `/data get entity` needs each entity's whole NBT
   form, which is its own project. It refuses with a sentence that reads correctly, and an issue
   tracks it.

## Slices

| Slice | Change | Packages |
| ----- | ------ | -------- |
| 1 | Typed tags, SNBT and NBT paths | `nbt`, `errors` |
| 2 | Command storage: the level store and its save, `/data … storage`, `/function … with`, typed `execute store`, `getData`'s result | `commands`, `prismarine` |
| 3 | `ItemContainer` and `EntityInventory` for players. `Inventory` and `ContainerEntry` go | `prismarine` |
| 4 | Mobs on `EntityInventory`, with per-slot log entries, the record kept readable, and replication from slot entries | `prismarine`, `entity-goals`, `script-host` as needed |
| 5 | `slotAddress.ts`, with `/replaceitem`, `/loot replace` and `/item` for players, mobs and blocks. `setSlot` takes no storage target. The other slot tables read from it | `commands`, `prismarine`, `items`, `entities` |
| 6 | Parity scenarios, user docs and an ADR for the slot model | `parity`, `docs` |

Slice 2 is independent of 3 to 5. Slices 3, 4 and 5 touch the same files and land in order.

## Status

| Slice | State |
| ----- | ----- |
| 1 | Landed |
| 2 | Not started |
| 3 | Not started |
| 4 | Not started |
| 5 | Not started |
| 6 | Not started |

## Open questions

- Bedrock sends a mob's inventory screen (`ContainerOpen` with `WindowTypes.HORSE`) and has an
  `ItemStackRequest` container for it. The server sends neither, so a player cannot open a horse.
  That is outside this plan, but `EntityInventory` gives it a store to serve.
- Stack network ids are written onto the stored `Item`. They are Bedrock wire state, and a
  per-session table keyed by container and slot would keep them out of the world model. This
  plan leaves them where they are.
