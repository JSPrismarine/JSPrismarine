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
   form, which is its own project. It refuses with a sentence that reads correctly, and
   [#3575](https://github.com/JSPrismarine/JSPrismarine/issues/3575) tracks it.

10. **The player inventory stays `HumanInventory`.** It is a subclass of
    `EntityInventory` over `PLAYER_LAYOUT`, which sits beside `mobLayout` in
    `inventory/EntityInventory.ts`, and adds only the stack network id counter
    (`assignStackNetworkId`, `assignStackNetworkIds`) and `isHotbarSlot`. Keeping the name keeps
    the `inventory/HumanInventory` entry point and every import of it, where a rename would touch
    each one for no change in behavior. The armor sums are on `EntityInventory`, since a mob's
    armor sits in the same container. `EntityInventory` takes the layout's container names as a
    type parameter, so `inventory.container('armor')` on a player is never undefined, and
    `containerNamed` serves a name read off the change log or the wire.

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
| 2 | Landed |
| 3 | Landed |
| 4 | Landed |
| 5 | Landed |
| 6 | Landed |

## Slice 4: how mobs carry items

Recorded when slice 4 landed, on 2026-11-21.

- **Every mob has an `EntityInventory`.** `MobBody.inventory` is built from `mobLayout(0)`, and
  the runtime sizes its `inventory` container from the active `minecraft:inventory` at spawn, at
  restore and on each tick. A store player's body has one too and leaves it empty, since the
  player's slots are the store player's `HumanInventory`.
- **The main hand replaced `carried`, and the container replaced the flat list.** The goals'
  `heldItem`, `carriedItem` and `setCarriedItem` read and write `equipment('mainhand')` through
  `EntityRuntime.setHeldItem`, which writes one of the item and nothing when the hand already
  holds it. The goals' `inventory()` and `shareInventory()` list the `inventory` container one
  identifier per item (`entity/data/mobInventory.ts`), and villager work edits that list and
  writes back only the difference, so a stack the work did not touch keeps its name and
  enchantments. Pickups, gifts and crafts put stacks into the container. A mob takes off the
  ground only what its hand and its container can keep, and a stack handed to it that does not
  fit drops at its feet. A mob with no `minecraft:inventory` no longer keeps an unbounded list.
- **Aliases replace the second copy.** `MobBody.equipmentInventorySlots` stays the logged alias
  map, and every change to it points `EntityInventory.setAlias` at the `inventory` slot. A
  horse's armor is one stack in `inventory` slot 1, which `equipment('body')` reads; its own
  `body` slot stays empty while the alias is set.
- **A capacity change is logged.** `inventorySize` is a logged body field. A shrink empties the
  slots it takes away first, each an `inventory-slot` entry, and logs the size after them, so an
  undo restores the size before it writes the stacks back. The runtime drops what a shrink took
  at the mob's feet, where Java's `AbstractHorse.createInventory` would lose it.
- **Equipment changes come from slot writes.** A write to a slot an equipment slot reads, or a
  change of alias, moves `equipmentRevision` and calls `onEquipmentChanged(slot, equipped)`,
  which fires the components' `on_equip` events. An undo moves the revision and calls nothing.
- **Replication reads slot entries.** A mob's membership entry derives its slots from the
  record's `containerSlots` and `equipment`, and its alias map from `equipmentInventorySlots`.
  `EntityReplica.equipmentAddresses` resolves where each equipment slot reads, and replication
  sends equipment packets when a tick writes one of those slots or the alias map. `EntityView`
  no longer carries equipment.
- **The record keeps its keys.** `equipment`, `containerSlots` and `equipmentInventorySlots`
  are written from the inventory in their old shapes, with an aliased slot in both `equipment`
  and `containerSlots` as before. `carried` and `inventory` are no longer written. A legacy
  `carried` fills the main hand when `equipment` has none, and legacy `inventory` identifiers go
  into the container after its saved slots. A record that holds more than the container takes
  grows it on load, and the first tick's resize drops the rest at the mob's feet.
- **A hopper minecart fills slot by slot.** `suckInItems` keeps `insertStack`, Java's
  `HopperBlockEntity.addItem` order, because `ItemContainer.add` tops up every matching stack
  before it takes an empty slot.

### What slice 5 reads from a mob

- `mainhand`, `offhand` and `body` are one-slot containers. `armor` is head, chest, legs, feet.
- A mount's `inventory` container is the `minecraft:inventory` of its tamed group: the horse's
  2 slots (saddle 0, armor 1), the donkey's 16 (saddle 0, chest slots after it), the llama's
  16 less 3 for each strength point it lacks (carpet in slot 1), and the camel's one saddle slot,
  sized from its `minecraft:equippable`. An untamed horse has no container.
- Equipping horse armor or a carpet into its container slot aliases `body` to that slot, so
  `equipment('body')` and `inventory` slot 1 are the same stack. The saddle has no equipment
  slot: it is `inventory` slot 0 and nothing else. A parser that writes `equipment('body')`
  writes the container slot whenever the alias is set.

## Slice 5: how commands reach slots

Recorded when slice 5 landed, on 2026-11-21.

- **A Java name is a number, and the holder reads it.** `inventory/slotAddress.ts` keeps Java
  26.3's `SlotRanges` table: each name stands for the numbers Java gives it (`hotbar.0` is 0,
  `inventory.0` is 9, `enderchest.0` is 200, `armor.feet` is 100), and the holder answers a number
  the way Java's `getSlot` does. So `container.0` is a player's hotbar slot 0 and a chest
  minecart's first slot, and `/loot replace … <count>` walks on from the number, as Java's
  `LootCommand` does. The parity suite reads the table off Java's class file. `villager.N` and
  `horse.saddle`, which 26.3 renamed, read as `mob.inventory.N` and `saddle`.
- **A mob's container means what its `container_type` says.** `horse` is a mount's, whose chest
  slots are the container slots its `minecraft:equippable` does not claim, there only while it
  has `minecraft:is_chested`. `inventory`, the default, is a villager's or a piglin's pocket,
  `mob.inventory.N`. Any other type, such as `minecart_chest`, is a container `container.N` reaches.
  Bedrock's `slot.inventory N` is a mob's whole container, and `slot.equippable N` the `N`th slot its
  `minecraft:equippable` lists.
- **A mount's armor goes where its screen shows it.** `armor.body` on a horse or a llama resolves to
  the container slot of its first non-saddle equippable entry and sets the `body` alias there, so
  the armor is one stack, as equipping it by hand leaves it.
- **The command seam takes every target.** `SlotTarget` is a block or an entity, with no storage
  form. `setSlot`, `copySlots` and `applyItemModifier` take every target a line names, and a
  target without the slot is skipped; the line fails only when none had it. `/loot replace` rolls
  once for all its targets. `setSlot` returns the slots it wrote and takes Java's `fill` and
  `override` beside Bedrock's modes.
- **Equipment slot names keep one home each.** The parser reads equipment names from
  `entity/equipment.ts`, which now holds `BEDROCK_EQUIPMENT_SLOT_NAMES` beside `MOB_EQUIPMENT_SLOTS`,
  rather than holding them itself: `equipment.ts` imports nothing from the inventory, so the
  parser can import it without a cycle. `EntityRuntime`'s event names and `actorPort`'s armor index
  read from there and from `mobEquipmentAddress`. A player's and a mob's filter domains share
  `filterDomainStack` in `entity/data/filterView.ts`. `@jsprismarine/entities` holds its seven
  component slot names once, as `ENTITY_EQUIPMENT_SLOT_NAMES`. Two tables stay: `@jsprismarine/items`'
  `WEARABLE_SLOTS`, since that package depends on neither, and `@jsprismarine/commands`'
  `ENTITY_EQUIPMENT_SLOTS`, which is the client's enum.
- **Three gaps have issues.** Item modifiers on `/item`
  ([#3607](https://github.com/JSPrismarine/JSPrismarine/issues/3607)), `horse.chest` and
  `player.crafting.N` ([#3608](https://github.com/JSPrismarine/JSPrismarine/issues/3608)), and
  `execute if items`, which reads its slots as an NBT path
  ([#3609](https://github.com/JSPrismarine/JSPrismarine/issues/3609)).
- **Read from the class files, not confirmed by a run.** That `/item replace` with one stack writes
  only the first slot a wildcard covers (`ItemProvider.of`), that `override` empties the rest
  (`orElseProvide(EMPTY)`), and that each target gets the stacks from the start. That `/item … from`
  copies empty source slots, which `SlotCollection.itemCopies` suggests. That `slot.equippable N`
  counts the equippable list in order; a llama declares its one carpet slot as `slot: 1`.

## Open questions

- Bedrock sends a mob's inventory screen (`ContainerOpen` with `WindowTypes.HORSE`) and has an
  `ItemStackRequest` container for it. The server sends neither, so a player cannot open a horse.
  That is outside this plan, but `EntityInventory` gives it a store to serve.
- An `Item` has no keep-on-death flag, item lock or script dynamic properties, so a script that
  puts a stack carrying them into a mob's container gets it back without them, as a player's
  inventory already did. A `ContentItemDrop` carried them before slice 4.
- Stack network ids are written onto the stored `Item`. They are Bedrock wire state, and a
  per-session table keyed by container and slot would keep them out of the world model. This
  plan leaves them where they are.
