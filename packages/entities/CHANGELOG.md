# @jsprismarine/entities

## 0.23.2

### Patch Changes

- Updated dependencies [[`5f48cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/5f48cd10e4ca5b53ef19ebd214b70b1de18acca9)]:
  - @jsprismarine/errors@0.23.2
  - @jsprismarine/content@0.23.2
  - @jsprismarine/mapping@0.23.2
  - @jsprismarine/molang@0.23.2
  - @jsprismarine/packs@0.23.2

## 0.23.1

### Patch Changes

- [#3481](https://github.com/JSPrismarine/JSPrismarine/pull/3481) [`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f) Thanks [@filiphsps](https://github.com/filiphsps)! - Export the types the public API already uses, so a consumer can name what a function takes or returns. Each package's entry point now exports the interfaces, type aliases and classes its exported signatures reference, and `@jsprismarine/prismarine` and `@jsprismarine/script-host` publish the modules that define them.
  
  `@jsprismarine/protocol` exports five wire types under new names, because the packet API already uses the plain names for other types: `ActorLinkFields`, `AbilityLayerFields`, `SerializedAbilitiesDataFields`, `GameRuleFields` and `UUIDValue`.
- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/errors@0.23.1
  - @jsprismarine/mapping@0.23.1
  - @jsprismarine/packs@0.23.1
  - @jsprismarine/content@0.23.1
  - @jsprismarine/molang@0.23.1

## 0.23.0

### Minor Changes

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- [#3218](https://github.com/JSPrismarine/JSPrismarine/pull/3218) [`e304e99`](https://github.com/JSPrismarine/JSPrismarine/commit/e304e993f54ce5c92e7d4103008076e0d767c0b0) Thanks [@filiphsps](https://github.com/filiphsps)! - `EntityInstance.queuePropertyWrite` queues a property write for the entity's next tick, as an event's `set_property` lands.

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Errors carry a stable code and a link to their entry in the error reference at https://jsprismarine.dev/errors/, from their catalog in `@jsprismarine/errors`. Messages are unchanged.

- [#3451](https://github.com/JSPrismarine/JSPrismarine/pull/3451) [`4e02e0b`](https://github.com/JSPrismarine/JSPrismarine/commit/4e02e0b72800bca87529013b34712be0df006874) Thanks [@filiphsps](https://github.com/filiphsps)! - Spawn a fox, rabbit, strider or villager grown when it spawns on its own, by a spawn egg, `/summon` or as a spawn group's first member, as Java does. A rabbit spawn group's later members are babies, and a strider group's later members are babies half the time.

- [`3bb64da`](https://github.com/JSPrismarine/JSPrismarine/commit/3bb64dae3e3ea4e01bca0de55cdedfd678c9c3bf) Thanks [@filiphsps](https://github.com/filiphsps)! - Peaceful follows Java's rules for the mobs already in a world. Each row of `java_entity_attributes` carries `allowedInPeaceful`, Java's `EntityType.isAllowedInPeaceful` from the pinned server, and the entity runtime discards a mob whose type is not allowed on its next tick while the world is on peaceful, named or not, as `Mob.checkDespawn` does. Hostile mobs are gone once the difficulty changes to peaceful, and a monster loaded from a save goes on its first tick. No mob takes a player as its target on peaceful, as Java's `LivingEntity.canAttack` refuses, so a neutral mob a player hits does not turn on them.

- [#3218](https://github.com/JSPrismarine/JSPrismarine/pull/3218) [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9) Thanks [@filiphsps](https://github.com/filiphsps)! - Behavior pack scripts hear most of the remaining `world.afterEvents` and `world.beforeEvents` of `@minecraft/server`: a player's block placement, game mode change, change of dimension, emote, button input, input mode, hotbar slot, inventory changes, cursor, crafting, mining, arm swing, item use stages, dropped and picked-up stacks, containers opened and closed, name tags and script messages; an entity's load and removal, melee hits, projectile hits, status effects, heals, health changes, taming and data-driven events; explosions and the blocks they clear, game rule changes, and pistons, levers, buttons and pressure plates. The before-events run as guards of their actions and can cancel them or change what they allow, such as an effect's duration, a blow's damage, a heal's amount, a game mode or the blocks a blast clears. Each subscriber's options pick the events it gets. Block custom components get `onStepOn`, `onEntityFallOn`, `onEntity`, `onRedstoneUpdate` and `onBlockStateChange`.
  
  The server raises a kernel event for each of these, which plugins can listen to as well: `playerPlaceBlock` and `playerBlockPlaced`, `playerGamemodeChanged`, `playerDimensionChanged`, `entityRemove` and `entityRemoved`, `entityEffectAdd` and `entityEffectAdded`, `entityHeal`, `entityHealed` and `entityHealthChanged`, `explosion` and `exploded`, and the rest that `docs/guide/extending.md` lists. `playerSetGamemode`'s mode is writable.
  
  For code that embeds these packages: `ScriptWorld` has an optional `guardGameEvents`, `ScriptWorldEvent` has a `game` variant, engine-systems' `ExplosionOptions` takes a `guard`, entities' `EntityEnvironment` takes `eventApplied`, block-behaviors' `WorldActions` takes `redstoneActivated`, and protocol exports `ScriptMessagePacket`.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`af89e9c`](https://github.com/JSPrismarine/JSPrismarine/commit/af89e9cadd3cfd2f6652e79ada341e12ac5f66c8), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`2dd8ff2`](https://github.com/JSPrismarine/JSPrismarine/commit/2dd8ff2fda5afab035cae34e1542c73443cfeb3b), [`2d461cb`](https://github.com/JSPrismarine/JSPrismarine/commit/2d461cbe0f493a6482b19ba298df277fb95cf4bb), [`4d92994`](https://github.com/JSPrismarine/JSPrismarine/commit/4d929943617a9cd77d55fb8b2cdd6343665152b4), [`c1f1339`](https://github.com/JSPrismarine/JSPrismarine/commit/c1f1339aea746b7a86016ba68739517049d8967e), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`104bb4d`](https://github.com/JSPrismarine/JSPrismarine/commit/104bb4d4a3dbf7654c19294b4a1d66724d591ad3), [`6787fdd`](https://github.com/JSPrismarine/JSPrismarine/commit/6787fdd6ff50c80110f4951a0cea51214611eea0), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0
  - @jsprismarine/packs@0.23.0
  - @jsprismarine/content@0.23.0
  - @jsprismarine/molang@0.23.0
  - @jsprismarine/mapping@0.23.0

## 0.22.0

### Patch Changes

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`4ffca69`](https://github.com/JSPrismarine/JSPrismarine/commit/4ffca6962fbf64ab4c166105136f05bf55754785) Thanks [@filiphsps](https://github.com/filiphsps)! - Advance a baby fed an item with an explicit `growth` by that fraction of the whole growth duration, which gives a horse, donkey or mule Java's fixed seconds per item: 20 for wheat, 180 for a hay bale. A plain feed item still advances a tenth of the time left.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`626a69c`](https://github.com/JSPrismarine/JSPrismarine/commit/626a69ccaaaa8a1ca5d1dd7c9ff1542e86e938fd) Thanks [@filiphsps](https://github.com/filiphsps)! - Read a `minecraft:attack` damage written as a `[min, max]` list. The hoglin and zoglin adults write theirs that way, and the component read it as 0, so neither mob hurt anything.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`007a5ea`](https://github.com/JSPrismarine/JSPrismarine/commit/007a5eacc9bb52e44e2becb65b139313cad701c5) Thanks [@filiphsps](https://github.com/filiphsps)! - `minecraft:combat_regeneration` now rewards a player who kills the entity's target with Regeneration and takes away Mining Fatigue, as Java's `Axolotl.onStopAttacking` does, where it rewarded only the entity itself or its kin.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`da13973`](https://github.com/JSPrismarine/JSPrismarine/commit/da13973976f9bb8fa2e0b56f2052dafd21704024) Thanks [@filiphsps](https://github.com/filiphsps)! - Read `damage_modifier` in `minecraft:damage_sensor` triggers and add it after the multiplier, so a goat takes ten less from a fall, and treat a trigger whose cause is `all` as answering every cause. Falls and freezing no longer hurt a type in Java's `fall_damage_immune` or `freeze_immune_entity_types` entity type tags.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`3610da2`](https://github.com/JSPrismarine/JSPrismarine/commit/3610da25e96d3c3693da2b1e705b8b2d605847a0) Thanks [@filiphsps](https://github.com/filiphsps)! - Make a mob between 32 and 128 blocks from the nearest player wait out `minecraft:despawn`'s `min_range_inactivity_timer` (30 seconds by default) before it rolls its random despawn. It rolled every tick from the moment it spawned, so a mob a player walked away from could vanish at once. Java's `Mob.checkDespawn` has the same rule as `noActionTime > 600`.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`0fa1344`](https://github.com/JSPrismarine/JSPrismarine/commit/0fa134406ad5741c68facf7052a60b0f011bf93a) Thanks [@filiphsps](https://github.com/filiphsps)! - Run `minecraft:drying_out_timer`. Out of water and rain it counts up to `total_time` and fires `dried_out_event`; water or rain stops it with `stopped_drying_out_event`, or `recover_after_dried_out_event` once the entity had dried out. `minecraft:damage_over_time` now lands its first blow on its first active tick, as Java hurts a vex the tick its life runs out and a dolphin the tick it dries.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`33082ec`](https://github.com/JSPrismarine/JSPrismarine/commit/33082ec55be1f828b9ccffe705e39b61b913193f) Thanks [@filiphsps](https://github.com/filiphsps)! - An enderman struck by a projectile teleports as Java's does. `minecraft:teleport` tries up to 64 teleports on a projectile hit and takes no damage from it even when none lands. A host can give the actuator `randomTeleport`, Java's `Enderman.teleport` landing rule: the destination is drawn anywhere in the teleport cube, drops to the ground under it, and is refused in water or where the entity does not fit. The server's runtime implements it and sends the `minecraft:teleport` game event when the enderman lands, for its random teleports too.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`127b459`](https://github.com/JSPrismarine/JSPrismarine/commit/127b459d3e08d45537f6810ce50f4afd3db3fa25) Thanks [@filiphsps](https://github.com/filiphsps)! - Run Java's air rules in `minecraft:breathable`. An entity out of air is hurt every 20 ticks instead of every 10, a land breather regains 4 air a tick instead of refilling at once, a water breather back in water refills at once, and lava no longer spends air unless the body sets `breathes_lava` to false.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`0f9ed99`](https://github.com/JSPrismarine/JSPrismarine/commit/0f9ed99c1e01730decebfa0f56f97329d8dbf176) Thanks [@filiphsps](https://github.com/filiphsps)! - Drown mobs once a second and spawn Java's mobs in every biome. A mob out of air takes its drowning blow every second, as in both editions, rather than every half second. The entity overlay now lets hostile mobs spawn in rivers, frozen rivers and snowy plains, skeletons in mangrove swamps, rabbits in old growth taigas and bats in old growth birch forests, as Java's biome spawn lists do.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`e911c47`](https://github.com/JSPrismarine/JSPrismarine/commit/e911c47c4dc0d0ebac4b2ee77a2c22977f824cf5) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the evoker's fangs and fix falling blocks. Evoker fangs now exist: they bite whatever stands on them for 6 magic damage eight ticks after they rise, spare the evoker that cast them, and leave after 23 ticks. A falling block falls with Java's gravity and drag, breaks into its item when it lands in a block it cannot replace, such as a torch, and a falling anvil hurts what it lands on by 2 per block fallen past the first.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`089d411`](https://github.com/JSPrismarine/JSPrismarine/commit/089d411b6ffd8c4af63bed35b59ab01aaba1a353) Thanks [@filiphsps](https://github.com/filiphsps)! - Answer the `is_color` filter test. An entity now reports the color its `minecraft:color` component holds, by the names Bedrock filters use, so a filter such as the evoker's "blue sheep" test matches.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`f0e7eb1`](https://github.com/JSPrismarine/JSPrismarine/commit/f0e7eb10df4e829d451ecd3af725d4bbabe4c7a9) Thanks [@filiphsps](https://github.com/filiphsps)! - Run `minecraft:genetics`: a spawned goat or panda draws its alleles and raises the birth event of the variant they express, so a goat spawns as a screamer or a plain goat and can be milked, and a panda gets its gene.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`4ffca69`](https://github.com/JSPrismarine/JSPrismarine/commit/4ffca6962fbf64ab4c166105136f05bf55754785) Thanks [@filiphsps](https://github.com/filiphsps)! - Match the items and entities vanilla files still name by their legacy identifiers. A baby cat now eats cod (`fish`), a foal eats an enchanted golden apple (`appleEnchanted`), a grown turtle drops a turtle scute (`turtle_shell_piece`), and a pig struck by lightning becomes a zombified piglin (`pig_zombie`) instead of vanishing.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`7b44c4c`](https://github.com/JSPrismarine/JSPrismarine/commit/7b44c4cd93df3869dc08e34898a3ca24b79fba0b) Thanks [@filiphsps](https://github.com/filiphsps)! - Tag the snowy taiga for snow foxes and white rabbits, and the ice spikes for snow foxes, as Java's biome tags do.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`87191cd`](https://github.com/JSPrismarine/JSPrismarine/commit/87191cd86b7281046c817ea85270c14967b3ccc0) Thanks [@filiphsps](https://github.com/filiphsps)! - Give a sulfur cube's herd mates their own spawn event, so the first cube of a herd always spawns full size and only the others may spawn small.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`321e697`](https://github.com/JSPrismarine/JSPrismarine/commit/321e6979115019811a546e93d5da367171569e03) Thanks [@filiphsps](https://github.com/filiphsps)! - Save a thrown eye of ender with its chunk, as Java does. The built-in definition no longer declares `minecraft:transient`, and a restored eye carries on its flight from its saved state.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`1fc4c45`](https://github.com/JSPrismarine/JSPrismarine/commit/1fc4c45d80d54517acae278b74b9527b92595bd8) Thanks [@filiphsps](https://github.com/filiphsps)! - Run `minecraft:trust` and `minecraft:bribeable`. A bred fox trusts the players who fed its parents, which the `trusts` filter test and `minecraft:behavior.defend_trusted_target` now read; the `trusts` test asks the entity about the subject, as Bedrock documents, rather than the other way round. A grown dolphin eats any item of Java's `fishes` tag and leads its player to treasure only while it holds that bribe, spending it when the swim ends. Item interactions now carry the used item's Java tags.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`d1ee7a3`](https://github.com/JSPrismarine/JSPrismarine/commit/d1ee7a3d2fd525b2487148d1e4ba3ab131ff536c) Thanks [@filiphsps](https://github.com/filiphsps)! - Define and run the painting, the leash knot and the ominous item spawner. Paintings and leash knots now spawn: each holds still and, on Java's 100-tick check, breaks when its wall or fence is gone, a painting dropping its item. An ominous item spawner lets its item go between 60 and 120 ticks after it appears, firing an arrow or another projectile item straight down and dropping anything else, and then leaves.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`205722f`](https://github.com/JSPrismarine/JSPrismarine/commit/205722f0230dadfea3d25eefb451b8645ef21d94) Thanks [@filiphsps](https://github.com/filiphsps)! - Run `minecraft:tamemount`. An untamed horse, donkey, mule, zombie horse or llama keeps a temper that starts at 0 and that Java's feeding amounts raise, and each buck with a player on its back tames it when Java's `nextInt(maxTemper)` falls below the temper, or adds 5 and throws every rider off. A buck used to dismount the horse from its own vehicle instead of throwing its rider. `GoalWorld` gains `ejectRiders` and `tameBy`.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`b6c42bf`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c42bf0e250b2b20e7ff0862a8b6c4074f3370c) Thanks [@filiphsps](https://github.com/filiphsps)! - The `hourly_clock_time` filter compares the time of day to the tick, as the vanilla pack's creaking writes it with 23400 and 12600, where it was rounded down to the hour and its `>` and `<=` tests were off by up to an hour.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`0ab8650`](https://github.com/JSPrismarine/JSPrismarine/commit/0ab86502ee94c75aa340edd1a062fb7eb95cc17d) Thanks [@filiphsps](https://github.com/filiphsps)! - Record whether a `minecraft:inventory` states its `inventory_size`, as `InventoryParams.declaresSize`, so a mount that leaves it out, such as the camel or the nautilus, holds only its equipment. Move the item-name matching `has_equipment` filters use into `itemNames.ts`, where `itemMatchesName` reads a pre-flattening name such as `carpet` the way the filters do.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`91dc371`](https://github.com/JSPrismarine/JSPrismarine/commit/91dc371a5b1c352bb859a64a15bd4704f6e94984) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `javaMoveControlTurn`, the degrees a mob's Java move control turns it toward its waypoint each tick, and carry the new move-control and door fields of Java's navigation table on `JavaEntityNavigation`.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`8022cb7`](https://github.com/JSPrismarine/JSPrismarine/commit/8022cb7b552b9837f451ff7776d2792b5495078a) Thanks [@filiphsps](https://github.com/filiphsps)! - Draw a spawned panda's gene from Java's `Panda.Gene.getRandom` table, and let bred pandas and goats inherit from their parents: a panda takes one allele from each parent with a one in 32 mutation on each, and a goat kid takes the screaming of the parent it was picked from. `EntityInstance` gains `parents`, and a spawn can name the entities it was bred from.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`44a68ec`](https://github.com/JSPrismarine/JSPrismarine/commit/44a68ec1aba917018203b53b76a55255dd6eafc6) Thanks [@filiphsps](https://github.com/filiphsps)! - Roll Java's taming odds, one in three for the wolf, cat and nautili and one in ten for the parrot, instead of Bedrock's rounded 0.33, and run `minecraft:trusting`: feeding an ocelot cod or salmon wins its trust on Java's one in three and eats the food either way.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`2ccf7e3`](https://github.com/JSPrismarine/JSPrismarine/commit/2ccf7e3d48c6620e3b7b6f0080c8277181894b6d) Thanks [@filiphsps](https://github.com/filiphsps)! - `minecraft:knockback_resistance` now holds values down to -2, the bottom of Java's range. The attribute stopped at 0, so a bouncy or sticky sulfur cube lost the -2 its archetype declares and took a normal push instead of three times one.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`c7daa77`](https://github.com/JSPrismarine/JSPrismarine/commit/c7daa77fb7d42b94499f49dc68aaabd489b010c1) Thanks [@filiphsps](https://github.com/filiphsps)! - Lava destroys boats, rafts and cushions as it does in Java. `minecraft:hurt_on_condition` hurts an entity that declares no health every tick, since Java's half-second invulnerability belongs to living entities, so a boat in lava breaks on its second tick. A cushion checks for lava and fire every 101 ticks, as Java's `BlockAttachedEntity` does, and burns away on that check, dropping the cushion item of its color.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`f570be0`](https://github.com/JSPrismarine/JSPrismarine/commit/f570be08e6dbc1dee2f66b4d8a29e0fd09c88c12) Thanks [@filiphsps](https://github.com/filiphsps)! - Read a pre-flattening item name in a `has_equipment` filter as the items it became. The llama's carpet interaction asks for `carpet`, which Bedrock now holds as sixteen colored carpet items, so a player holding any carpet could not put it on a llama. `carpet` now matches every color and `carpet:14` the red one, through Bedrock's own legacy item table.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`4f027b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4f027b52594da5dad466e4bb55ab79ca75969edd) Thanks [@filiphsps](https://github.com/filiphsps)! - Read the legacy item names Mojang's pack still writes as the modern item a player holds: milking hands back a milk bucket instead of a bucket with an auxiliary value of 1, and `fish` reads as cod, so cod tames a cat and an ocelot.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`4cba707`](https://github.com/JSPrismarine/JSPrismarine/commit/4cba707208fad7ce689de15fc992dc83bfc3971a) Thanks [@filiphsps](https://github.com/filiphsps)! - Run `minecraft:looked_at` and `minecraft:peek`. A player looking at an entity, by Java's `isLookingAtMe` with the field of view as its tolerance, raises `looked_at_event` once the stare has lasted `min_looked_at_duration`, `not_looked_at_event` when it ends, and makes the player its target unless `set_target` is `never`. A shulker peeks as Java's `ShulkerPeekGoal` has it, opening 30 for 20 to 60 ticks on a one-in-20 roll every other tick, and opens fully while it has a target; `peekAmount` reads how far its shell is open. `EntityEnvironment` gains the optional `lookers` and `targetLooker` hooks.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`d637f9e`](https://github.com/JSPrismarine/JSPrismarine/commit/d637f9ee461c7c79f103dcfd221c68837f26db24) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `measured` to `DamageEvent`. A measured blow is already what the entity's own rules make of its cause, so a `minecraft:damage_sensor` trigger leaves its amount alone, whatever its `deals_damage`, `damage_multiplier` or `damage_modifier`, and still fires its event. Immunities still turn it aside.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`6f10d54`](https://github.com/JSPrismarine/JSPrismarine/commit/6f10d544a9a90e6f4275984c29d2d83e0f0fcb10) Thanks [@filiphsps](https://github.com/filiphsps)! - Let a mob that rides another mob steer it, as Java does, and stop running `minecraft:behavior.mount_pathing`, a goal no Java class registers. The rider's walks now move its mount (Java's `Mob.getNavigation` hands a rider its controlled vehicle's navigation), and the mount's own move, look and jump goals stand down while a mob steers it (`Mob.updateControlFlags`). A baby zombie on a chicken used to stay put on a chicken that wandered off on its own; now the chicken runs where the zombie chases and the zombie still attacks. `GoalScheduler` gains `setFlagEnabled`, Java's `GoalSelector.setControlFlag`.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`edf7c0c`](https://github.com/JSPrismarine/JSPrismarine/commit/edf7c0c39659ed0ecfe674575eae05c74226855a) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep a named mob loaded: neither `minecraft:despawn` nor the despawn pass removes a mob with a name tag, as Java's `Mob.setPersistenceRequired` keeps it.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`b4ad684`](https://github.com/JSPrismarine/JSPrismarine/commit/b4ad68468671838aa1bef016346645b9f63d7143) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `peekAmountOf` to `@jsprismarine/entities/components/peek`. It reads how far a shulker's shell is open from the `minecraft:peek` state as plain data, the form a journal or a save carries.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`83a9331`](https://github.com/JSPrismarine/JSPrismarine/commit/83a9331f215001c8c60f9abb439250525c50cae5) Thanks [@filiphsps](https://github.com/filiphsps)! - A `minecraft:healable` item with a negative `heal_amount` now hurts the entity by that much instead of doing nothing. A parrot fed a cookie dies at once and is poisoned for 900 ticks, as Java's `Parrot.mobInteract` does. A hurt tamed nautilus fed its food now heals before it breeds, as Java's `AbstractNautilus.mobInteract` does.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`b7f4780`](https://github.com/JSPrismarine/JSPrismarine/commit/b7f4780e371f2bd5b2d2e5ef906141dcfaab4c24) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep the phantom's Bedrock attack damage of 6. Java's attribute dump publishes 2, the monster default, because `Phantom.updatePhantomSizeInfo` sets the damage to 6 plus the phantom's size in code, so taking the dump left a phantom's bite at a third of its strength.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`27f5860`](https://github.com/JSPrismarine/JSPrismarine/commit/27f5860294a3feba094ebf7afb3a1514b7f0bf65) Thanks [@filiphsps](https://github.com/filiphsps)! - A happy ghast, and a tamed nautilus or zombie nautilus, settles a new home where it is once it strays 16 or 8 blocks past its home radius while nothing rides or leashes it, as Java's `checkRestriction` has it, so one ridden far away wanders about where it was left. `minecraft:home` takes `rehome_beyond` and `rehome_tamed_only` keys for it.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`50f2d4a`](https://github.com/JSPrismarine/JSPrismarine/commit/50f2d4aac7d1d8ad14f006dc9ddecf352baca59f) Thanks [@filiphsps](https://github.com/filiphsps)! - The `rider_count` filter test counts the riders a host seats on an entity itself, as the server's runtime does, where it read 0 whenever the instance's own seats were empty.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`b35cdc7`](https://github.com/JSPrismarine/JSPrismarine/commit/b35cdc7bbe74d7c966c3b5e8b09c44fc04e2f29a) Thanks [@filiphsps](https://github.com/filiphsps)! - Draw a `minecraft:spawn_entity` wait in whole ticks from `min_wait_time` up to but not including `max_wait_time`, so a chicken lays every 6000 to 11999 ticks as Java's does, not up to 12000.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`bb32ba4`](https://github.com/JSPrismarine/JSPrismarine/commit/bb32ba45751d75a3e0e089f200859b9a6a1ff0d6) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply `minecraft:spell_effects`'s `remove_effects` before its `add_effects`, so a component that names one effect in both refreshes it instead of ending it. A bee fed an open eyeblossom or a wither rose took no poison or wither at all, because its feeding groups list the effect under both keys.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`489b9da`](https://github.com/JSPrismarine/JSPrismarine/commit/489b9da10174639c14bbfca4e120a703688cf888) Thanks [@filiphsps](https://github.com/filiphsps)! - A sulfur cube that swallowed a block now keeps its archetype's knockback resistance, such as the slow bouncy archetype's 0.4 or the bouncy one's -2. Java's base of 0 replaced the value each archetype group declares, where Java's own cube adds the archetype's attribute modifiers on top of it. `JAVA_STATE_STATS` now lists the twelve archetype groups.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`32db937`](https://github.com/JSPrismarine/JSPrismarine/commit/32db9377f210710aa46744293c6ba176e1dd0cbc) Thanks [@filiphsps](https://github.com/filiphsps)! - A tamed wolf has Java's 40 maximum health. Java's stat for the wolf type is the wild wolf's 8, and it used to overwrite the health group the pack adds once the wolf is tamed. `JAVA_STATE_STATS` now lists the component groups whose stat Java's class sets for the state they stand for, and a component such a group adds declares that value.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`4ffca69`](https://github.com/JSPrismarine/JSPrismarine/commit/4ffca6962fbf64ab4c166105136f05bf55754785) Thanks [@filiphsps](https://github.com/filiphsps)! - Draw a `minecraft:transformation` delay between `value + range_min` and `value + range_max` seconds. A cured zombie villager now takes Java's 3600 to 6000 ticks instead of a fixed 2000. `TransformationParams` gains `delayRange`.
- Updated dependencies [[`546c624`](https://github.com/JSPrismarine/JSPrismarine/commit/546c624aaeeefec693909b9e3413819d3bb45f9f), [`6c08cc8`](https://github.com/JSPrismarine/JSPrismarine/commit/6c08cc82964458a0913751e0761cdd274eaf7349), [`bf5aca9`](https://github.com/JSPrismarine/JSPrismarine/commit/bf5aca98eed1198b84057e8369d45f0651be2b51)]:
  - @jsprismarine/mapping@0.22.0
  - @jsprismarine/packs@0.22.0
  - @jsprismarine/content@0.22.0
  - @jsprismarine/molang@0.22.0

## 0.21.0

### Minor Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`37eb905`](https://github.com/JSPrismarine/JSPrismarine/commit/37eb9053b4ba2e9ed5ca65404fa7129c75dea04f) Thanks [@filiphsps](https://github.com/filiphsps)! - Damage can be sensed without being applied. `EntityInstance.senseDamage` reports what the sensors and immunities make of a blow, with the sensor's multiplier and events, and changes nothing. `EntityInstance.applyDamage` applies an amount with those events. `minecraft:damage_sensor` now names its event instead of firing it, and the event fires when the damage is applied, so `damage` behaves as before. An environment that supplies `EntityEnvironment.damage` receives the damage components deal, such as drowning and `minecraft:hurt_on_condition`, so a host can run it through its own pipeline.
  
  Breaking: the entity fires the events an `onDamage` hook returns when it applies the damage. A hook that fired its event with `entity.fire` and also returned it, as `minecraft:damage_sensor` did, now fires it twice. Return the event and do not call `entity.fire`.

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`363bc4b`](https://github.com/JSPrismarine/JSPrismarine/commit/363bc4bfc1fab7119e2f915bc95369543643af2c) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop the angry sound of `minecraft:angry` when the anger runs out. An entity whose calm event leaves the component in place, or that has no calm event, kept playing `angry_sound` on its interval after it calmed down.

- [#3066](https://github.com/JSPrismarine/JSPrismarine/pull/3066) [`3ae62c9`](https://github.com/JSPrismarine/JSPrismarine/commit/3ae62c9b49c995dc5047c916c784c7f64aff2d31) Thanks [@filiphsps](https://github.com/filiphsps)! - `Attributes.setMax` moves an attribute's maximum and holds its base and current value to the new bound, reporting the write like any other.

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`304a733`](https://github.com/JSPrismarine/JSPrismarine/commit/304a7338b577f3bc86870d5f9eca134b74a79dc5) Thanks [@filiphsps](https://github.com/filiphsps)! - `stateField.number`, `stateField.id` and the plain-data check of component state accept finite numbers only. A JSON record writes `Infinity` and `NaN` as `null`, so a component that held one saved a record its own guard refused on load, and the component quietly started from its initial state. A write that a declared field guard refuses is now refused when it is made. A guard a component writes itself decides for its own fields.

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`869b0fd`](https://github.com/JSPrismarine/JSPrismarine/commit/869b0fd00c52877eadfdd6594d6f288a2cfb3ba8) Thanks [@filiphsps](https://github.com/filiphsps)! - Freeze the inside of a component state value that arrives already frozen. A component that wrote `Object.freeze({ seen: [] })` could still push to `seen`, changing stored state without a reported write.

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`3246094`](https://github.com/JSPrismarine/JSPrismarine/commit/3246094c5f015aa47f61872d91064d0ffada0098) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep component state on the instance. Timers, cooldowns, the air supply and every other value a component carries between ticks now live in `EntityInstance.componentState`, one plain-data record per component, instead of `WeakMap`s inside the component modules. A component declares its state with `defineComponentState` and reads and writes it through the typed key. Every write goes through `ComponentStates.write` and reaches the new `EntityEnvironment.componentStateWritten` hook with its before and after values, so a host can log and undo it, and `snapshot` and `restore` save and load it. Simulation behavior does not change.

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`02c3c4f`](https://github.com/JSPrismarine/JSPrismarine/commit/02c3c4fed413754c61ee94466c181a0df3cf0127) Thanks [@filiphsps](https://github.com/filiphsps)! - Report every attribute, property and component group change to the host. `EntityEnvironment` gains `attributeWritten`, `propertyWritten` and `componentGroupsWritten`, each called with the value before and after the change, and a write that changes nothing is not reported. `Attributes.restore` puts an attribute back exactly, bounds included, and `EntityInstance.restoreComponentGroups` sets the active groups to a given list and rebuilds the component set without running an event. A host undoes a change with these two and `PropertyValues.set`. The group report arrives after the attribute and component state writes its rebuild made. `PropertyValues` takes the observer as an optional third constructor argument, and `Attributes` as an optional second one.

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`b46bf9a`](https://github.com/JSPrismarine/JSPrismarine/commit/b46bf9a56f8b70e076f471d4574815a66cc947b4) Thanks [@filiphsps](https://github.com/filiphsps)! - `minecraft:inside_block_notifier` looks up the block list entries an entity was inside on its last tick in a set, so each tick costs one lookup per entry instead of a scan of the last matches for every entry.

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`939f1d1`](https://github.com/JSPrismarine/JSPrismarine/commit/939f1d169d4ef7f2cc29ecf1ac1e16a7cadb3784) Thanks [@filiphsps](https://github.com/filiphsps)! - Dropped stacks and saved actors with no pack type are store actors, so the player body is the one subclass of `Entity` left. A dropped stack is shown through an `ItemActor` (`entity/data/itemActor.ts`), a `StoreActor` that goes on the wire as an `AddItemActor`, ticks its portal clock through `StoreActor.update` and moves between dimensions from one store to the other. A saved actor whose type no loaded pack declares, which used to stay in the world as a `GenericEntity`, comes back through `LiveEntityRuntime.restoreInert` as an `InertActor` over the new built-in `jsprismarine:inert_actor` type: it is shown and saved under its own identifier with every actor record tag it was loaded with, and runs nothing. Dropped stacks merge, are picked up, burn, fall into the void and go through portals as before, and saves are unchanged.
  
  Breaking: a dropped stack is no longer in `World.getEntities()` or found by `World.getEntity()`; `World.getActors()` and `World.getActor()` list and find it. `ItemActorBody`, `ItemBodies`, `LiveEntityRuntime.itemBodies`, `unload` and `removeBody` are removed, and `LiveEntityRuntime.adoptItem` takes the leaving actor, where it arrives and its cooldown. `EntitySerializer.fromNBT` returns a plain `StoredActor` and takes no world, and `LiveEntityRuntime.restore`, `restoreItem` and `restoreExisting` take one. `World.addEntity` no longer hands a body to the store. `entity/GenericEntity.ts` and `Entities.writtenEntities` are removed.
  
  The entity overlay adds `jsprismarine:inert_actor`, the type a saved actor no pack declares is held under.

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`a62725a`](https://github.com/JSPrismarine/JSPrismarine/commit/a62725a4b2c149d165fcb48c8b8816f6114e1fc4) Thanks [@filiphsps](https://github.com/filiphsps)! - Ship built-in definitions for `minecraft:item` and `minecraft:eye_of_ender_signal` in the entity overlay, with the `jsprismarine:item` and `jsprismarine:eye_of_ender_signal` components that carry their tuning. Mojang's pack has no file for either, and a pack later in the stack that ships one replaces it.

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`b86f58f`](https://github.com/JSPrismarine/JSPrismarine/commit/b86f58f3ed84856df9758f2d86a1563219815edf) Thanks [@filiphsps](https://github.com/filiphsps)! - The shipped `minecraft:item` definition is no longer summonable, as Bedrock Dedicated Server advertises it. `/summon` supplies no item stack, so a summoned dropped item was refused as invalid.

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`8f42dce`](https://github.com/JSPrismarine/JSPrismarine/commit/8f42dceac036a8b896069c40835944ee4190b1c1) Thanks [@filiphsps](https://github.com/filiphsps)! - The shipped `jsprismarine:item` component no longer declares `lava_damage` and `void_depth`. The dropped item never read either: hazard damage and the void depth come from the server's shared tables, so a pack that changed them changed nothing.

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`7c3219a`](https://github.com/JSPrismarine/JSPrismarine/commit/7c3219a7baa1944f9a613bbbe97b9280f4c08c06) Thanks [@filiphsps](https://github.com/filiphsps)! - `minecraft:movement.jump` reads its `jump_delay`. The component's params carry `jumpDelay`, the wait between two hops in seconds as a `[min, max]` pair, which the slime family declares and a host needs to hop them at Bedrock's cadence. The other movement flavors are unchanged.

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`2e1e953`](https://github.com/JSPrismarine/JSPrismarine/commit/2e1e9532a42d6e6b38eb4ed923738946635e3f86) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep `minecraft:target_nearby_sensor` state out of an entity's saved form. It names the target by runtime id, which the next session draws again and could give to another entity, so a reload now starts the sensor with no target, as it did before component state was saved. `defineComponentState` takes an optional third argument, `{ saved: false }`, which `ComponentStates.snapshot` leaves out and `ComponentStates.restore` ignores, so a record written before this change loads as if it left that state out.

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`eec2435`](https://github.com/JSPrismarine/JSPrismarine/commit/eec2435c0ecf23fd43a9fdb28c4cfc9da0281aba) Thanks [@filiphsps](https://github.com/filiphsps)! - Run `minecraft:mob_effect` and `minecraft:spell_effects` through their own factories. `registerEntityComponents` registered both names as data-only components first and then skipped the factories that apply the effects, so a puffed-up pufferfish poisoned nothing and a component group's spell effects were never added or removed.
- Updated dependencies [[`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175), [`7977682`](https://github.com/JSPrismarine/JSPrismarine/commit/797768230c41b0fb03c06b30230f4ba8dd9d2d9b), [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e), [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964), [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c), [`1c6e390`](https://github.com/JSPrismarine/JSPrismarine/commit/1c6e39015c4dcc454d188dc4423d6fd8930ec21b)]:
  - @jsprismarine/content@0.21.0
  - @jsprismarine/mapping@0.21.0
  - @jsprismarine/molang@0.21.0
  - @jsprismarine/packs@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/mapping@0.20.0
  - @jsprismarine/content@0.20.0
  - @jsprismarine/molang@0.20.0
  - @jsprismarine/packs@0.20.0

## 0.19.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/content@0.19.2
  - @jsprismarine/mapping@0.19.2
  - @jsprismarine/molang@0.19.2
  - @jsprismarine/packs@0.19.2

## 0.19.1

### Patch Changes

- Updated dependencies [[`5129bc5`](https://github.com/JSPrismarine/JSPrismarine/commit/5129bc5166f8a781bd3f928e24b687744cdbd8c9)]:
  - @jsprismarine/mapping@0.19.1
  - @jsprismarine/content@0.19.1
  - @jsprismarine/molang@0.19.1
  - @jsprismarine/packs@0.19.1

## 0.19.0

### Patch Changes

- [`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e) Thanks [@filiphsps](https://github.com/filiphsps)! - Point the Discord link in each package README at the project's current invite.
- Updated dependencies [[`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e)]:
  - @jsprismarine/molang@0.19.0
  - @jsprismarine/mapping@0.19.0
  - @jsprismarine/content@0.19.0
  - @jsprismarine/packs@0.19.0

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.
- Updated dependencies [[`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1), [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015), [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596), [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5), [`7418be1`](https://github.com/JSPrismarine/JSPrismarine/commit/7418be10dd694d6bb5f284896ea80cab1efdb551)]:
  - @jsprismarine/content@0.18.0
  - @jsprismarine/mapping@0.18.0
  - @jsprismarine/molang@0.18.0
  - @jsprismarine/packs@0.18.0

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- [`b4940f3`](https://github.com/JSPrismarine/JSPrismarine/commit/b4940f32e1fcd3640af201432f67ee382d50efc6) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep goal running state and control-flag holders on the scheduler's own slots instead of looking them up by name each tick.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`f5b3d7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f5b3d7c830dc19189d85e21af834391192ccb481) Thanks [@filiphsps](https://github.com/filiphsps)! - Match Java flee-sun preconditions and bounded candidate draws.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`57d0d17`](https://github.com/JSPrismarine/JSPrismarine/commit/57d0d17d8577cde351c634e6b0dadd00a1ea6428) Thanks [@filiphsps](https://github.com/filiphsps)! - Match Java goal selector cadence and inactivity.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`d8e0a48`](https://github.com/JSPrismarine/JSPrismarine/commit/d8e0a48ead973091d46f81760e9dbfde08522449) Thanks [@filiphsps](https://github.com/filiphsps)! - Cache component-derived entity facts by active set.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`f44af22`](https://github.com/JSPrismarine/JSPrismarine/commit/f44af22c7f60d46edff66d84c478b7e2f07a76cf) Thanks [@filiphsps](https://github.com/filiphsps)! - Skip Bedrock goal scheduling for brain-only entities.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`86915c4`](https://github.com/JSPrismarine/JSPrismarine/commit/86915c42d90df184dbb200ecd81e52cc11a76892) Thanks [@filiphsps](https://github.com/filiphsps)! - Index large entity collision boxes by overlapped cells to keep collision and area-attack queries local. Fixes [#2793](https://github.com/JSPrismarine/JSPrismarine/issues/2793).

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`3934d28`](https://github.com/JSPrismarine/JSPrismarine/commit/3934d281e96f022a0d57c95d8de99794ed6dd244) Thanks [@filiphsps](https://github.com/filiphsps)! - Reduce allocations while resolving blocks and content types.
- Updated dependencies [[`5d424a0`](https://github.com/JSPrismarine/JSPrismarine/commit/5d424a05c2c9721f9d6a9863949f95d290cc13a5), [`8cc701d`](https://github.com/JSPrismarine/JSPrismarine/commit/8cc701d6dc05532abf27c10d87d0a3b6dbd25b73), [`678e192`](https://github.com/JSPrismarine/JSPrismarine/commit/678e192e09582001760956a2f215619776fffa8e), [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d), [`7aabb3a`](https://github.com/JSPrismarine/JSPrismarine/commit/7aabb3a82903eae555ca83bddcb409bb0a4f693c), [`3934d28`](https://github.com/JSPrismarine/JSPrismarine/commit/3934d281e96f022a0d57c95d8de99794ed6dd244)]:
  - @jsprismarine/molang@0.17.0
  - @jsprismarine/packs@0.17.0
  - @jsprismarine/content@0.17.0
  - @jsprismarine/mapping@0.17.0

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a825e54`](https://github.com/JSPrismarine/JSPrismarine/commit/a825e5478baccfc586fc3acd3fd5d8d9fc17a02d) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement piglin admire and barter interactions

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`582536f`](https://github.com/JSPrismarine/JSPrismarine/commit/582536f53c4ed407b065155dc6dce7f5f48982d8) Thanks [@filiphsps](https://github.com/filiphsps)! - Carry out the event actions, fire the `minecraft:on_*` triggers, and give the components that
  measure most real behavior. The package parsed the vanilla pack well and then did almost nothing
  with it: 16 of the 157 implemented components carried behavior, every event action was collected
  raw and reported, and nothing fired the eleven trigger components.
  
  **Event actions.** Nine keys parse into an `EntityAction` and run. Eight are everything the composed
  vanilla pack writes, measured over its 850 events: `play_sound` 23 uses, `set_home_position` 17,
  `emit_vibration` 9, `drop_item` 2, `execute_event_on_home_block` 2, and one each of
  `emit_particle`, `reset_target` and `stop_movement`. The ninth is `queue_command`, which the
  documentation describes and no vanilla entity uses. Six leave through the new
  `EntityEnvironment.effects` seam; `set_home_position` and `stop_movement` go through the actuator
  and `reset_target` clears the attack target the entity now owns. An action key the package does not
  parse, a body it cannot read, and an action whose environment member a caller left out each reach
  the report.
  
  **Damage and triggers.** `EntityInstance.damage` applies the damage instead of only offering it to
  the components. The sensors decide the amount with the damager answering the `damager` and `other`
  filter subjects, `minecraft:fire_immune` and `minecraft:freezing_immune` turn their causes aside
  after the sensors have seen them, the rest comes off the `health` attribute, and
  `minecraft:on_hurt`, `minecraft:on_hurt_by_player` and `minecraft:on_death` fire in that order.
  `setAttackTarget` fires the two target triggers. `EntityInstance.trigger` is the firing point for
  all eleven; the six that name equipment, fire, flight, sleep and friendly anger wait for a caller.
  
  **Components.** `minecraft:hurt_on_condition` (87 of the 129 vanilla entities),
  `minecraft:breathable` (84), `minecraft:ageable` (35), `minecraft:ambient_sound_interval` (32),
  `minecraft:rideable` (36), `minecraft:angry` (20) and `minecraft:damage_over_time` (3) stopped being
  parse-only. `minecraft:despawn` now leaves a `minecraft:persistent` entity alone, and
  `minecraft:timer` and `minecraft:environment_sensor` honor a `target` other than `self` through the
  new `EntityInstance.raise`. 37 of the 157 implemented keys carry behavior, up from 16.
  
  **Breaking.** `EntityInstance.damage` returns a `DamageResult` rather than a `DamageOutcome`,
  `EventAction` gained a `parsed` member, `TriggerComponentParams` and `RideableParams` moved to their
  own modules with `target` narrowed from `string` to `EventTarget`, and `TRIGGER_COMPONENTS` is now a
  tuple of its eleven names.
  
  `@jsprismarine/bedrock-data` exports the Java attribute golden as `java_entity_attributes`, which
  the entity corpus test measures the Bedrock stats against: 423 stats are published in both editions
  and 279 agree.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`da1793e`](https://github.com/JSPrismarine/JSPrismarine/commit/da1793e286c051351c49dfb1e35b002a6e787bce) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix two gaps the written entity classes were covering, found by connecting real clients to a
  server running the data path alone.
  
  A data-driven mob dropped nothing when it died. `EntityRuntime.kill` read the loot table off the
  resolved type, which only ever sees an entity's base components, and 29 of the 128 vanilla entity
  files declare `minecraft:loot` only inside a component group. The cow carries it in
  `minecraft:cow_adult`, so every cow, pig, sheep and chicken in the world died empty-handed. The
  table is now read off the live instance through `EntityInstance.lootTable()`, which sees the
  groups the entity's spawn event turned on, and falls back to the type.
  
  `minecraft:behavior.mount_pathing` started on nothing more than the entity having a target. The
  adult zombie carries it at priority 2 and `minecraft:behavior.melee_box_attack` at priority 4, and
  both claim the `move` and `look` control flags, so the moment a zombie picked a player it took
  those flags off every goal below it and stood still. Mojang's wording for the goal is "while
  mounted", and it now refuses unless the entity is riding something.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f4ec478`](https://github.com/JSPrismarine/JSPrismarine/commit/f4ec4787eb307bbeefe5d51034f43b0728088c55) Thanks [@filiphsps](https://github.com/filiphsps)! - Add slot-based equipment-change triggers to data-driven entities

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`35dc8ab`](https://github.com/JSPrismarine/JSPrismarine/commit/35dc8ab56ba8acf18a68357c3c0ca1e4ed1f8801) Thanks [@filiphsps](https://github.com/filiphsps)! - Use each entity's navigation and physics data, and place spawned mobs at their correct feet positions.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3f0e622`](https://github.com/JSPrismarine/JSPrismarine/commit/3f0e6228843e07f161a665424b7d7fad69273188) Thanks [@filiphsps](https://github.com/filiphsps)! - Use loaded crafting recipes for `minecraft:shareables` rules with `craft_into` when entities share items.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0d64a00`](https://github.com/JSPrismarine/JSPrismarine/commit/0d64a00ec60a7c2064030bfdcec0b2ca26de5236) Thanks [@filiphsps](https://github.com/filiphsps)! - Fire `minecraft:on_start_landing` when an airborne data-driven entity lands.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`376f8e2`](https://github.com/JSPrismarine/JSPrismarine/commit/376f8e258ba349d5fa5d7c496b3aa6b8045dec46) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the `play_sounds` effects declared by `minecraft:interact` entries.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`91eaefa`](https://github.com/JSPrismarine/JSPrismarine/commit/91eaefae197242e2476901190792924edcabb0fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven proximity and one-shot status effects.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b194cc3`](https://github.com/JSPrismarine/JSPrismarine/commit/b194cc3b8a647bd944f78b60903cf23edcc04d1b) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement `minecraft:combat_regeneration`, including self and same-family rewards when an attack target dies.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9617d18`](https://github.com/JSPrismarine/JSPrismarine/commit/9617d187fd9dad87384a46b57548d94441123eeb) Thanks [@filiphsps](https://github.com/filiphsps)! - Read mate and offspring rules from minecraft:offspring_data and retain legacy offspring support.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c59762e`](https://github.com/JSPrismarine/JSPrismarine/commit/c59762eb7d8d7e58bd477e48de087667c565045b) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven entity sensors

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2e922ce`](https://github.com/JSPrismarine/JSPrismarine/commit/2e922ce3b1e06c27fbcfac65d2d01a977f2e5ccc) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement the data-driven target-nearby sensor

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9dffb9a`](https://github.com/JSPrismarine/JSPrismarine/commit/9dffb9aa993febd34d79d0bd40afb4334bcd09fa) Thanks [@filiphsps](https://github.com/filiphsps)! - Load the shipped vanilla pack stack in strict mode, and report the files behind a collapsed
  diagnostic.
  
  A Bedrock definition file that fails structural parsing is still an error, unless a later pack in
  the stack provides the same pack-relative path. That copy replaces the broken one whole, so the
  broken file cannot reach the composed result and a warning is enough. The BDS vanilla layers need
  this rule: two of them carry an `entities/npc.json` that patches a saved pack rather than defining
  an entity, and the 1.20.80 layer carries the real one. Strict mode now fails on errors alone, which
  is what `DiagnosticSeverity` already documented, so `load(bdsVanillaLayers, { strict: true })`
  succeeds.
  
  `DiagnosticCollector` still collapses repeats of one pack, code and message into a single
  diagnostic, because a pack-wide pattern should cost one line of the report. A collapsed diagnostic
  now carries `occurrences`, the number of files it covers, and `paths`, the first five of them, so a
  per-file finding that happens 28 times no longer reads as one.
  
  `@jsprismarine/entities` drops `normalizeFilterSource`, which rewrote two vanilla filter shapes the
  packs grammar once rejected and now accepts. All 982 filter values in the BDS layers and
  bedrock-samples parse to the same result without it. `parseEntityFilter` is the packs parser under
  the entities name.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`59a3e5c`](https://github.com/JSPrismarine/JSPrismarine/commit/59a3e5c5b910027bcb07b47ed65faa177a2c8d98) Thanks [@filiphsps](https://github.com/filiphsps)! - Handle matching spawn eggs through the spawn_egg_interaction component hook.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3a673cf`](https://github.com/JSPrismarine/JSPrismarine/commit/3a673cf89f9c11a8c3ba503c7a62dfc21ca1b5b0) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven entity teleport behavior

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`931294b`](https://github.com/JSPrismarine/JSPrismarine/commit/931294b82cad6bc2ed4d65a68c36e3c7c560bf00) Thanks [@filiphsps](https://github.com/filiphsps)! - Register the charged creeper marker and project its powered actor flag.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bf9bb09`](https://github.com/JSPrismarine/JSPrismarine/commit/bf9bb0905c5278e4ffc2fd88a7eebe62db6c7ea3) Thanks [@filiphsps](https://github.com/filiphsps)! - Project vanilla actor marker components to client metadata.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c0ccdfe`](https://github.com/JSPrismarine/JSPrismarine/commit/c0ccdfeb805c0869006d380408dc74f84496ddaf) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement angry component broadcasts with nearby filters and target propagation.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`985c08e`](https://github.com/JSPrismarine/JSPrismarine/commit/985c08e1f93cbb557a8ce8be02fb2e0a04587f31) Thanks [@filiphsps](https://github.com/filiphsps)! - Drive baby growth from ageable feed item data and honor configured result items.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`609b543`](https://github.com/JSPrismarine/JSPrismarine/commit/609b543617f8731ab597322cf5a6132e4d4ca519) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/entities`, the Bedrock entity definition, component and event runtime. It parses
  the five top-level keys of an entity file structurally and reports an unknown key rather than
  refusing the file, dispatches on `format_version` for the four gated features, and resolves
  `components` and `component_groups` once at load through `@jsprismarine/content`. The event engine
  determines an event's effects immediately and applies them on the entity's next tick, with `add`,
  `remove`, `sequence`, weighted `randomize` against an injectable random source, `first_valid`,
  `trigger` with target routing and a cycle guard, and `set_property`; re-adding an active component
  group re-initializes its components. Entity properties carry the four types with range clamping and
  Molang defaults. The filter evaluator covers all 107 documented tests over a context of eight entity
  subjects plus item, block and world views, reusing the grammar and both encodings from
  `@jsprismarine/packs`. The goal seam is a `GoalFactory` plus a priority scheduler over the `move`,
  `look` and `jump` control flags, with three reference goals. 157 of the 202 non-goal component keys
  vanilla uses are implemented, which covers every non-goal component of 102 of the 129 vanilla
  entities.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`97fde37`](https://github.com/JSPrismarine/JSPrismarine/commit/97fde374f2812e33f4b6a71bbbcf268b78963700) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply entity attack protection and attacker exception filters from entity data.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`03e6df9`](https://github.com/JSPrismarine/JSPrismarine/commit/03e6df9845bc83a24309e667bb10a7bcd17c2d88) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply lethal entity events before removal and finish the data-defined Ender Dragon death behavior.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d29e1d4`](https://github.com/JSPrismarine/JSPrismarine/commit/d29e1d4ef750af20698531f32a3e36040312d3a9) Thanks [@filiphsps](https://github.com/filiphsps)! - Emit named particles declared by `minecraft:interact.particle_on_start`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c1f0bc3`](https://github.com/JSPrismarine/JSPrismarine/commit/c1f0bc3fe5abfffa6c43d9cc44a407e4e25fd10a) Thanks [@filiphsps](https://github.com/filiphsps)! - Honor `minecraft:interact.swing` and relay successful interaction animations to clients tracking the player.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cd8645c`](https://github.com/JSPrismarine/JSPrismarine/commit/cd8645c9b8bfcb48162a0c9f99a5d4c7449ea613) Thanks [@filiphsps](https://github.com/filiphsps)! - Decide which edition owns each entity stat the two editions disagree on.
  
  The cross-check against Java's attribute dump measured 423 stats both editions publish for the same
  entity and found 144 disagreements, and it recorded them as findings while running on Bedrock's
  numbers. `src/javaStats.ts` now decides them per stat. Java decides `max_health`, `attack_damage`,
  `follow_range` and `knockback_resistance`, the four a Bedrock client never computes for itself: it
  draws hearts from an attribute the server sends, carries no damage field on an attack, runs no mob
  AI, and takes knockback as a server-sent position delta. Bedrock decides `movement_speed`,
  `flying_speed`, `jump_strength`, `width` and `height`, which `ClientMovementPredictionSyncPacket`
  lists among the inputs the client predicts an actor with, and which for the hitbox also have to
  match the model the client draws.
  
  31 disagreements resolve to Java, so a wither spawns with 300 health instead of 600 and a witch
  follows from 16 blocks instead of 64. 98 keep Bedrock's value because Bedrock decides the stat, and
  15 are reviewed exceptions where Java's supplier publishes a number Java Edition overwrites at
  spawn, such as the horse's 53 health or a slime's size-scaled 20. The reasoning is in
  `docs/adr/0001-entity-stat-authority.md` and decision 11 of `docs/plans/data-driven-vanilla.md`.
  
  `EntityEnvironment` gains an optional `javaStats` source, so passing
  `@jsprismarine/bedrock-data`'s `java_entity_attributes` turns the decision on; leaving it out runs
  the pack's own numbers as before. `Attributes` takes the resolved bases as a constructor argument,
  and `statRuling(identifier, stat)` turns a measured disagreement into an accepted row with its
  reason, so the parity dashboard derives its allow list from the decision rather than repeating it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f94da48`](https://github.com/JSPrismarine/JSPrismarine/commit/f94da4841180543ba50be440c4bc796a8a472fcb) Thanks [@filiphsps](https://github.com/filiphsps)! - Enforce the cooldown and post-damage cooldown declared by `minecraft:interact`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`701c6e7`](https://github.com/JSPrismarine/JSPrismarine/commit/701c6e7e83b91ae2eaa8aa2bbadbf049c6ef75cf) Thanks [@filiphsps](https://github.com/filiphsps)! - Load falling blocks from entity data and simulate their configured fall and landing behavior through the live entity runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`6237d25`](https://github.com/JSPrismarine/JSPrismarine/commit/6237d2570ef950f83dcc0111de283340ff35aca3) Thanks [@filiphsps](https://github.com/filiphsps)! - Move tameable item behavior into component hooks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1d905e2`](https://github.com/JSPrismarine/JSPrismarine/commit/1d905e27de007bc64a3f8c4f3c87c46955573e2a) Thanks [@filiphsps](https://github.com/filiphsps)! - Normalize legacy entity offspring data at type resolution and use the canonical component at runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c132c90`](https://github.com/JSPrismarine/JSPrismarine/commit/c132c9073992d5a0e8a7f9203298ec8711b0d585) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven area attacks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b503085`](https://github.com/JSPrismarine/JSPrismarine/commit/b503085d2c068c27dbb4087e00e3e1a12a42e384) Thanks [@filiphsps](https://github.com/filiphsps)! - Use the declared default for underwater movement

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`67546be`](https://github.com/JSPrismarine/JSPrismarine/commit/67546bec49a4f299b2be9b54b10a7d42865884a9) Thanks [@filiphsps](https://github.com/filiphsps)! - Support entities spawned by minecraft:interact

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`542da3b`](https://github.com/JSPrismarine/JSPrismarine/commit/542da3b62a4895905847cd14c0952a97d254d472) Thanks [@filiphsps](https://github.com/filiphsps)! - Read vanilla entity air drag, ground friction, and bounciness from active component data.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8196ea9`](https://github.com/JSPrismarine/JSPrismarine/commit/8196ea9e576d0acc3e17fe6b159791e25dc1092e) Thanks [@filiphsps](https://github.com/filiphsps)! - Honor `minecraft:transient` by excluding those entities from saved actor records.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`62df686`](https://github.com/JSPrismarine/JSPrismarine/commit/62df68684596605007aef673182fc0b5d61d1a1f) Thanks [@filiphsps](https://github.com/filiphsps)! - Run nameable entity behavior through the data-driven runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2bea6ac`](https://github.com/JSPrismarine/JSPrismarine/commit/2bea6ac82e3a0a100ee254c7e536df73262bef9f) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose mapped Java entity type tag memberships on resolved entity types and live entities.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c67300a`](https://github.com/JSPrismarine/JSPrismarine/commit/c67300a6cef6ec68daa9f720bc31c7f238874e01) Thanks [@filiphsps](https://github.com/filiphsps)! - Honor hurt_item in data-driven entity interactions.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0d53afd`](https://github.com/JSPrismarine/JSPrismarine/commit/0d53afdc4b0f42260231d56bbdeb2b4874f8bae7) Thanks [@filiphsps](https://github.com/filiphsps)! - Project entity interaction text to actor metadata

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d647e47`](https://github.com/JSPrismarine/JSPrismarine/commit/d647e4746b3533fbc61afac8414b749a253a32c1) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply data-driven `minecraft:interact.health_amount` effects and expose `is_missing_health` from an entity's health attribute.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7b70cc7`](https://github.com/JSPrismarine/JSPrismarine/commit/7b70cc76fb8f1584746b76ee406ad48811d5d6a2) Thanks [@filiphsps](https://github.com/filiphsps)! - Reach Java's stats for the five entities the pack still names the way Bedrock used to.
  
  `javaAttributeBases` looked an entity up in Java's attribute table by the identifier it spawned under, and that table is keyed by Java's names. Five of the 93 types it holds are a Bedrock entity that kept its older identifier: the evoker spawns as `evocation_illager`, the villager and zombie villager as `villager_v2` and `zombie_villager_v2`, the tropical fish as `tropicalfish` and the zombified piglin as `zombie_pigman`. None of them found their row, so the stat decision never applied to any of them. Two showed it in a value an operator can see: Bedrock's evoker followed from 64 blocks where Java's follows from 12, and Bedrock's villager from 128 where Java's follows from 16.
  
  The lookup now goes through `javaEntityTypeToBedrock` from `@jsprismarine/mapping`, which owns the Java to Bedrock identifier seam, so the renames are read off that table rather than copied here. A Bedrock identifier several Java types map onto, such as the one every boat variant lands on, is left alone, because there is no single Java row to take. `javaEntityStats` is exported for a caller that needs the row itself.
  
  The corpus test used to walk the Java table by name and skip anything the Bedrock registry did not have under that name, which is why it could not see this. It now resolves each type the same way, so the comparison covers 438 stats rather than 423, and the five are no longer invisible to it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`68cef3f`](https://github.com/JSPrismarine/JSPrismarine/commit/68cef3f794575714fef335397e8d6e21aa7ae512) Thanks [@filiphsps](https://github.com/filiphsps)! - Parse every vanilla entity component body

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7562d04`](https://github.com/JSPrismarine/JSPrismarine/commit/7562d044dae9cefb977dc5f24a9a82c7121d8365) Thanks [@filiphsps](https://github.com/filiphsps)! - Gate entity ticking by simulation distance and reuse filter views

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c5ae5e6`](https://github.com/JSPrismarine/JSPrismarine/commit/c5ae5e6e2e231751c82840c05dbc34435ccd7304) Thanks [@filiphsps](https://github.com/filiphsps)! - Avoid allocating family lists in goal neighbor checks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cd3077c`](https://github.com/JSPrismarine/JSPrismarine/commit/cd3077c55d5ee9984512f8e34660e7aae5b55680) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-defined ageable pause and reset effects.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`321a017`](https://github.com/JSPrismarine/JSPrismarine/commit/321a0170b36a2946fa3d06fe5924336222275de2) Thanks [@filiphsps](https://github.com/filiphsps)! - Route tame and breed interactions through entity data

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`fee1601`](https://github.com/JSPrismarine/JSPrismarine/commit/fee1601bb697b8ba9625b0d10e292d66f33d3391) Thanks [@filiphsps](https://github.com/filiphsps)! - Cut what a vanilla mob costs to tick, without changing a decision it takes.
  
  Path finding was nearly all of it, and almost none of that was the search itself. One node expansion
  asked the world about the same cell several times over. The node tested its own cost, each of its
  eight neighbors tested the two cells a diagonal would cut past, and every cell a node bordered was
  asked again when that cell was itself expanded. Ninety block reads per expansion. A `CellReader` per
  search keeps each answer, hands the view one position object instead of allocating one per read, and
  keys its memo on a packed integer rather than an `"x,y,z"` string. A node now costs about
  twenty-five reads.
  
  `findPath` also refuses outright when no cell within the goal radius is one the profile could stand
  in. A search succeeds only by popping a node inside that radius, and every node but the root came
  out of the enterable test, so such a search cannot succeed whatever it does. Saying so costs a few
  dozen block reads instead of the whole 512-node budget. That is where the tick spikes lived.
  `minecraft:behavior.flee_sun`, `find_cover`, `move_to_land` and `avoid_mob_type` draw up to ten
  candidate destinations and ask whether each is reachable, and a candidate three blocks in the air
  was costing the full budget: half a million block reads in one `canStart`, on every mob standing in
  daylight, on the same tick.
  
  `GoalScheduler` keeps its priority order between ticks rather than sorting the entry map three times
  a tick with a `localeCompare` comparator. The comparator is unchanged, so the order is the one it
  already produced.
  
  Measured over real vanilla entity definitions, thirty mobs around a player: the mean per-mob cost
  fell from 290 to 15 microseconds a tick, the 99th-percentile whole tick from 350 ms to 6 ms, and the
  worst tick from 1879 ms to 12 ms. At a hundred mobs the worst tick fell from 3571 ms to 42 ms. Every
  goal decision and every resulting path is unchanged, checked by digesting which goals ran on which
  mob and where each mob stood, every tick, over five seeded scenarios.
  
  The `entity-goals` bump is `minor` because `NavigationView` now states that the path finder hands
  every call the same position object. A view that reads the three numbers and answers, which is what
  the package's own `voxelGrid` and the server's view both do, needs no change. One that kept the
  object or keyed a cache on it does.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a0c479e`](https://github.com/JSPrismarine/JSPrismarine/commit/a0c479e0ab28de8ba46bac842ddc90a50d9e679f) Thanks [@filiphsps](https://github.com/filiphsps)! - Give a mob the equipment its table rolls, and show it to the clients watching.
  
  `minecraft:equipment` was parsed and thrown away. Its factory returned `{}`, so no mob ever rolled
  its table: a census of 90 live bodies found none holding an item, and `Entity.setHeldItem` had no
  callers anywhere. A skeleton fired from an empty fist, and the villager's trade offer and the
  enderman's carried block were written to `MobBody.carried` by the goals and read back only by other
  goals, because nothing mirrored them onto the body a client is sent.
  
  Bedrock drives mob gear from a loot table where Java hardcodes it in
  `Mob.populateDefaultEquipmentSlots`, so the component's `table` is the reference for what a mob
  spawns holding. Those tables are the behavior pack's own and Java has no counterpart: its registry
  carries `entities/skeleton` but no `entities/skeleton_gear`, and its only three `equipment/` tables
  are trial chamber ones. The roll therefore reads `definitions.lootTables` through the evaluator in
  `@jsprismarine/loot` rather than through a second evaluator written for it. Which slot a rolled item
  lands in comes from the item's own `minecraft:equippable`, so a table naming `minecraft:iron_helmet`
  dresses the head without a table of identifiers here going stale.
  
  Pools this evaluator cannot gate are left out. `@jsprismarine/loot` implements modern Java, where a
  pool carries one `condition`; Bedrock still writes the older plural `conditions` array and adds a
  pool-level `tiers`. A condition that is not read is a condition that does not gate, and handed
  `zombie_equipment.json` whole the evaluator armed 2000 of 2000 zombies where vanilla arms about one
  in twenty. What survives the pruning is each mob's signature weapon, the part that fires
  unconditionally in vanilla too: measured against a running server, 13 of the 18 vanilla types that
  carry the component get theirs, among them the skeleton's bow, the pillager's crossbow, the
  vindicator's axe, the wither skeleton's stone sword and the piglin's golden one. What is dropped is
  the chance-gated extras and the tiered armor sets, for which absent is both the safe direction and
  the common vanilla outcome. Reading the rest needs a Bedrock loot dialect in `@jsprismarine/loot`.
  
  Equipment reaches a client through one write funnel, the shape `blockentity/blockEntityWrite.ts`
  set. A revision counter answers whether anything was written at all, which on an ordinary tick is
  false for every entity in the world, and a write whose encoded bytes match what the body already
  carries is dropped before `WorldChangeSink.entityEquipmentChanged` hears about it. Over 300 ticks
  with 22 armed mobs in view, a real client received four equipment packets, every one of them for a
  mob that had just spawned and none for a mob it had already been told about; an unguarded per-tick
  write would have sent 13,200, and the same window carried 20,440 movement packets.
  
  `PlayerSession.sendEquipmentFor` is new and serves any entity, where `sendArmorFor` reads a
  `Human`'s armor container and so could not serve a mob. `WorldChangeSink` gains
  `entityEquipmentChanged`, which every implementer must now answer.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d490871`](https://github.com/JSPrismarine/JSPrismarine/commit/d49087199730fb9eac7d8ee1976ad36df8475394) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven inside block notifications.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b98742b`](https://github.com/JSPrismarine/JSPrismarine/commit/b98742b80037c69e51cf6059bff2b45147e6a53e) Thanks [@filiphsps](https://github.com/filiphsps)! - Project ignited marker state to client actor metadata.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`68febb8`](https://github.com/JSPrismarine/JSPrismarine/commit/68febb838436b90836c311f7cc435676dff5a438) Thanks [@filiphsps](https://github.com/filiphsps)! - Project Bedrock marker components to matching actor flags.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c32bfed`](https://github.com/JSPrismarine/JSPrismarine/commit/c32bfededb57b65bab45897dda54e0fa621d0ff1) Thanks [@filiphsps](https://github.com/filiphsps)! - Use Java-derived mob navigation and path costs, and separate overlapping mobs during movement.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5121b88`](https://github.com/JSPrismarine/JSPrismarine/commit/5121b88dab4fbfd3c6f14476ef2ae0014a710086) Thanks [@filiphsps](https://github.com/filiphsps)! - Support entity item repair interactions

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`738a665`](https://github.com/JSPrismarine/JSPrismarine/commit/738a66555ddfad7912d7b6c61f28e78a575996cc) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement the remaining data-driven `minecraft:angry` target, sound, and broadcast behavior.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-driven entity dyeing through the item behavior runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5445a16`](https://github.com/JSPrismarine/JSPrismarine/commit/5445a16a437bddc8726e71d4ae135d5286e351bb) Thanks [@filiphsps](https://github.com/filiphsps)! - Record an entity's spawn position as home when `minecraft:home` activates.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0e7d345`](https://github.com/JSPrismarine/JSPrismarine/commit/0e7d345611f49a463d03f3762f3006f5cab2aaf6) Thanks [@filiphsps](https://github.com/filiphsps)! - Emit vibration game events for data-defined interactions

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`259282c`](https://github.com/JSPrismarine/JSPrismarine/commit/259282cf8da2397f26bea2bea8816eb6e4ec91d4) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply configured status effects from healable entity items.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`949785e`](https://github.com/JSPrismarine/JSPrismarine/commit/949785e4be1ae2ffd834354fefe993990d5000d6) Thanks [@filiphsps](https://github.com/filiphsps)! - Use `minecraft:shareables` item names, tags, priorities, and pickup limits when entities collect drops.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`815800d`](https://github.com/JSPrismarine/JSPrismarine/commit/815800d3410bfd829fc583eb9bcd896369812247) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-defined interaction loot tables, resolve legacy Bedrock item variants, and preserve item counts and drop offsets.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a1c9fe5`](https://github.com/JSPrismarine/JSPrismarine/commit/a1c9fe587b5d6eb19a990c16766962c49f9614fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Move healable item behavior into its data-driven component

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d304979`](https://github.com/JSPrismarine/JSPrismarine/commit/d3049792f9f15adc6936c8049c56a913732ce036) Thanks [@filiphsps](https://github.com/filiphsps)! - Parse equip and drop interaction slots, and scan all slots for item filters

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9258ef1`](https://github.com/JSPrismarine/JSPrismarine/commit/9258ef152ef8c0802eefc2cad93e1f8ddb950f46) Thanks [@filiphsps](https://github.com/filiphsps)! - Run ageable pause and reset effects, and drop data-defined items when entities grow up.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`13147a3`](https://github.com/JSPrismarine/JSPrismarine/commit/13147a33e36e0f0a00fc5935b9b7f4862e8d686d) Thanks [@filiphsps](https://github.com/filiphsps)! - Track player bed-sleeping state so cats can fire `minecraft:on_wake_with_owner` when their
  owner wakes.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3c86e27`](https://github.com/JSPrismarine/JSPrismarine/commit/3c86e279350e4b8dd7c67c6ab84e9ab5b617faea) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-driven `minecraft:spawn_entity` timers through the live entity runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e3fbb5f`](https://github.com/JSPrismarine/JSPrismarine/commit/e3fbb5f7f4db31c80f4d07a51065fc3b28a726c6) Thanks [@filiphsps](https://github.com/filiphsps)! - Parse `minecraft:strength` and include strength-based slots in entity inventory capacity.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1b08aed`](https://github.com/JSPrismarine/JSPrismarine/commit/1b08aed5a46a79b19ee36c0cc644c958663d3c4b) Thanks [@filiphsps](https://github.com/filiphsps)! - Simulate the data-driven daylight burning component.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`aedac18`](https://github.com/JSPrismarine/JSPrismarine/commit/aedac183fbdabb86c1140c67feab3cf21b8f0ce9) Thanks [@filiphsps](https://github.com/filiphsps)! - Fire `minecraft:on_start_takeoff` after a data-driven entity's ground jump.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`163c611`](https://github.com/JSPrismarine/JSPrismarine/commit/163c611a935d954736c43f98aad3bf7ffa875917) Thanks [@filiphsps](https://github.com/filiphsps)! - Move ageable result_item handling into the component hook

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d06d825`](https://github.com/JSPrismarine/JSPrismarine/commit/d06d8258b8a875f15fbf4ae7b5a249377639742c) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply configured status effects on melee attacks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7ddfa43`](https://github.com/JSPrismarine/JSPrismarine/commit/7ddfa4319dcf42685218014950ad48dafbacc051) Thanks [@filiphsps](https://github.com/filiphsps)! - Move breed item handling into component hooks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`de16ae0`](https://github.com/JSPrismarine/JSPrismarine/commit/de16ae07c1f0167885a280a1fc91030b9fbfe0cf) Thanks [@filiphsps](https://github.com/filiphsps)! - Let spawn egg handlers decline unrelated item interactions.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c) Thanks [@filiphsps](https://github.com/filiphsps)! - Serve the vanilla behavior pack alone, and let Mojang's content load without 55 warnings about
  itself.
  
  The default stack handed the whole BDS `behavior_packs` folder to the loader, so a default build
  served the editor pack's five `editor:` entities, chemistry's balloon and ice bomb, and eight
  chemistry reducer recipes that won over the vanilla recipes of the same name. It now composes the
  packs it was asked for, by the header UUID a world references a pack by, and the default asks for
  the vanilla behavior pack: 129 entity types rather than 136. `PackStackRequest.bedrockPacks` names
  more packs by UUID, or `'all'` composes the folder whole, for a server that does want chemistry or
  the editor.
  
  A clean build reported 102 warnings and no error. 26 of them were the `"events": null` an entity
  with no events is written with, and 26 the empty `"remove": {}` of a randomize branch that changes
  nothing; the parser already read both correctly, so the warnings only taught an operator to skip
  the report. Both are silent now, and an events key that is neither an object nor null, and a
  `component_groups` that is there and is not a list, still report. What is left is 47 warnings that
  each name something the server does not do, and an unknown component now names the first file that
  declared it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`03e7f72`](https://github.com/JSPrismarine/JSPrismarine/commit/03e7f729a0fd42a8c6cb42582914f646b4a6762d) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply minecraft:interact add_items loot to the player inventory.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5a1ab40`](https://github.com/JSPrismarine/JSPrismarine/commit/5a1ab4010008ca1065cc934efb11701831d2c8ac) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-defined entity interaction filters, events, and held-item transformations through the live inventory.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2e24f49`](https://github.com/JSPrismarine/JSPrismarine/commit/2e24f499570960f91e53c0388e6ea00a7f662116) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven block sensors and route nearby block breaks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2291a0d`](https://github.com/JSPrismarine/JSPrismarine/commit/2291a0d0ce40d73af8eb09cf0e46cfa2ab79db5c) Thanks [@filiphsps](https://github.com/filiphsps)! - Support entity take-item interactions
- Updated dependencies [[`428fd29`](https://github.com/JSPrismarine/JSPrismarine/commit/428fd2953c93ea8472696575798735a4a36ec51b), [`232a1ce`](https://github.com/JSPrismarine/JSPrismarine/commit/232a1ce20b5ade2e33b703300fb671f0c3f62076), [`cde1039`](https://github.com/JSPrismarine/JSPrismarine/commit/cde1039d276df8d3787b361e072fafdb32a6da9a), [`f8a43ce`](https://github.com/JSPrismarine/JSPrismarine/commit/f8a43ce910da3d8e1c88091c8886a7c1d09ab0c0), [`e96d1b7`](https://github.com/JSPrismarine/JSPrismarine/commit/e96d1b76f18207192a9e815e6a2a558a8c4005ff), [`9dffb9a`](https://github.com/JSPrismarine/JSPrismarine/commit/9dffb9aa993febd34d79d0bd40afb4334bcd09fa), [`d4a2a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/d4a2a0b2787e171583e6db0aec1b750e8aeb1e95), [`d66cf52`](https://github.com/JSPrismarine/JSPrismarine/commit/d66cf527b79391e194f85137e1e5b573993c7947), [`d220519`](https://github.com/JSPrismarine/JSPrismarine/commit/d220519e2e460148a90cbde9d643033e27bf8f5e), [`f370405`](https://github.com/JSPrismarine/JSPrismarine/commit/f37040563ed0cac590fe971ef3a448cb2e01a581), [`c1591b1`](https://github.com/JSPrismarine/JSPrismarine/commit/c1591b1e567a51dc80ecbbdfdbdc8e7c7f4f6c42), [`c9cafc8`](https://github.com/JSPrismarine/JSPrismarine/commit/c9cafc8529e05fe90ea2812920feb76cbcaf4a1b), [`8518afc`](https://github.com/JSPrismarine/JSPrismarine/commit/8518afc7b9ee684ebe4255ce26e7b56d612a145a), [`4355293`](https://github.com/JSPrismarine/JSPrismarine/commit/4355293f75d669659511516448b9c600900c351b), [`db4b039`](https://github.com/JSPrismarine/JSPrismarine/commit/db4b039894d90ab3a7ee6fc700728adadfc678f5), [`08de1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/08de1bac21f3c5785a02649e4faa11d9a11f82b0), [`0626058`](https://github.com/JSPrismarine/JSPrismarine/commit/06260585d51d8ce0668b7cf854663bb1aea9aee9), [`2fcd89f`](https://github.com/JSPrismarine/JSPrismarine/commit/2fcd89f8ff551915692aedca68cd556735432590), [`91fcf8b`](https://github.com/JSPrismarine/JSPrismarine/commit/91fcf8b9a7c4334c8fab86bc4fae2b94356351d5), [`015a810`](https://github.com/JSPrismarine/JSPrismarine/commit/015a8102014c24f224797dec0b1919d3a045e1c3), [`29aa940`](https://github.com/JSPrismarine/JSPrismarine/commit/29aa940e8ddc1db5bf37b213179adad8e3eb21a5), [`78694d1`](https://github.com/JSPrismarine/JSPrismarine/commit/78694d1577b8bc994963b5eb53d712858ee363df), [`908645b`](https://github.com/JSPrismarine/JSPrismarine/commit/908645b1f8ea87a6e511dbe25675f39760b41627), [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a), [`32ce6f2`](https://github.com/JSPrismarine/JSPrismarine/commit/32ce6f2f752e7e89c4445d1936e13a6e243a3a30), [`9e53c61`](https://github.com/JSPrismarine/JSPrismarine/commit/9e53c61399266bf9e26dd87160c45ccd251a21f8), [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c), [`bed113d`](https://github.com/JSPrismarine/JSPrismarine/commit/bed113d91a2de02b80d5688c3f43eadf802271c4)]:
  - @jsprismarine/mapping@0.16.0
  - @jsprismarine/packs@0.16.0
  - @jsprismarine/content@0.16.0
  - @jsprismarine/molang@0.16.0
