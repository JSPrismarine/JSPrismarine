# @jsprismarine/item-behaviors

## 0.16.0

### Minor Changes

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`9355c0f`](https://github.com/JSPrismarine/JSPrismarine/commit/9355c0f65405075576b0e423e544d2e14b854bb1) Thanks [@filiphsps](https://github.com/filiphsps)! - Throw an eye of ender toward the nearest stronghold. `WorldActions` gains an optional `locate` query and the `locate` action becomes a `signal` action carrying the stack and the point to fly to, which removes `LocateAction` from the public union. The server answers the query through its structure search, spawns a written `EyeOfEnderSignal` that flies as Java's does and drops or shatters after eighty ticks, and offers a right click on nothing to the item in hand's `onUse`.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`a795436`](https://github.com/JSPrismarine/JSPrismarine/commit/a79543637243eea004ee18ab2ddf64cbbe2d5761) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep the item when the host cannot perform the action it would be spent on. `WorldActions` gains an optional `supports(kind)` query, and the empty map, the knowledge book, the nine throwables, a loaded crossbow, shears on an entity and the fishing rod ask it before they consume: a host that says no gets `{}`, the click taken and the stack unchanged, the way an eye of ender with no stronghold in range already answers. The server answers the query from the same table its actor port reports unwritten systems from, and from whether the live entity runtime is attached for projectiles, leads, naming and dyeing, so a right click on nothing no longer spends an empty map or a snowball on a server that draws no maps or throws nothing, and the inventory the client predicted is sent back.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`35dc8ab`](https://github.com/JSPrismarine/JSPrismarine/commit/35dc8ab56ba8acf18a68357c3c0ca1e4ed1f8801) Thanks [@filiphsps](https://github.com/filiphsps)! - Use each entity's navigation and physics data, and place spawned mobs at their correct feet positions.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2622782`](https://github.com/JSPrismarine/JSPrismarine/commit/262278286682d66bbd354b77de4965e8ea8d273b) Thanks [@filiphsps](https://github.com/filiphsps)! - Let the active honeycomb transformer registry decide which blocks can be waxed.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`f7759cc`](https://github.com/JSPrismarine/JSPrismarine/commit/f7759cca7ad8ea0db6630e15ffbf3e51d0f85c80) Thanks [@filiphsps](https://github.com/filiphsps)! - Complete the End dragon's four-crystal respawn sequence and validate crystal placement.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`832be6b`](https://github.com/JSPrismarine/JSPrismarine/commit/832be6b0f6dece7ba5b7b57c92b657cf33c3b7d2) Thanks [@filiphsps](https://github.com/filiphsps)! - Fill an end portal frame's eye only when the player holds an eye of ender; a bare hand or any other item leaves the frame empty. The eye of ender item behavior no longer carries its own unreachable frame-filling `onUseOn`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`62df686`](https://github.com/JSPrismarine/JSPrismarine/commit/62df68684596605007aef673182fc0b5d61d1a1f) Thanks [@filiphsps](https://github.com/filiphsps)! - Run nameable entity behavior through the data-driven runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`074f6a7`](https://github.com/JSPrismarine/JSPrismarine/commit/074f6a79ca56188e02a3a01440fc5971a40977e5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/item-behaviors`, the vanilla item behavior families that fill the seven hooks
  `@jsprismarine/items` declares and none of its 122 components implements. A classifier assigns every
  one of the 1658 Java items of the pinned 26.3 registry to exactly one of 47 families or to `data
  only`, and the counts are asserted rather than claimed: 88 spawn eggs, 82 equippables, 47 entity
  placements, 39 foods, 21 block-transforming tools, 18 maps, 17 bundles, 16 banners, 16 dyes, 9
  throwables, 7 each of mob buckets, spears, pickaxes and swords, and 1233 items with no item-side
  behavior, which are the block items and the plain materials. Where Java's data says what an item is,
  the family is recognized by component and the behavior binds wherever that component appears, so a
  pack's own food eats with no registration; where neither edition publishes anything to recognize it
  by, the family names identifiers.
  
  Behaviors reach the world through `WorldActions`, nine queries and one `perform` over a tagged union
  of 28 effects, so the package depends on no server class. `createTestWorld` is the typed double, with
  every query a value a test sets, every action in an ordered log and a fixed random sequence.
  `registerVanillaItemBehaviors(registry, { world, items })` registers and attaches all 41 behaviors in
  one call, in the order `HookTable.dispatchFirst` needs: a potion before the general consumable, the
  mace before the melee weapon, the stripping transform before the mining tool.
  
  The mining speed, break progress, attack damage and Unbreaking formulas are transcribed from the
  unobfuscated 26.3 server jar (`Player.getDestroySpeed`, `BlockBehaviour.getDestroyProgress`,
  `Player.attack`, `Tool.getMiningSpeed`, `RemoveBinomial.process`) and computed in `float` throughout,
  checked against 1665 golden vectors the jar itself produced through `utils/oracle/run.mjs`. Tool tier,
  Efficiency, Haste, Mining Fatigue and the in-water and off-ground penalties are all in. The README
  documents the divergence that matters: the Bedrock client computes its own break time with different
  Haste and Mining Fatigue terms, has no attribute to carry `mining_efficiency`, `block_break_speed` or
  `submerged_mining_speed`, and `server-authoritative-block-breaking` validates the client's prediction
  rather than replacing its timing, so Java's number is the server's figure and the client's timing is
  left alone.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-driven entity dyeing through the item behavior runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b96ce93`](https://github.com/JSPrismarine/JSPrismarine/commit/b96ce93238f3efd66c709f213cd8d5d42fc8f425) Thanks [@filiphsps](https://github.com/filiphsps)! - Spawn eggs now work on targeted entities, and matching eggs create babies for entity data that enables `minecraft:spawn_egg_interaction`.
- Updated dependencies [[`d5dc760`](https://github.com/JSPrismarine/JSPrismarine/commit/d5dc760107a1dbc9c5ba9eb5fc9fb544d725c02d), [`c140ef6`](https://github.com/JSPrismarine/JSPrismarine/commit/c140ef6e3072eb97c7a8b123876ea08726ed9910), [`b3a2a6f`](https://github.com/JSPrismarine/JSPrismarine/commit/b3a2a6f2d8baca370c541439257bfb4dc4786902), [`d4a2a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/d4a2a0b2787e171583e6db0aec1b750e8aeb1e95), [`440e164`](https://github.com/JSPrismarine/JSPrismarine/commit/440e164b88f43548c9c4fe8ae896387157f21701), [`2c459cd`](https://github.com/JSPrismarine/JSPrismarine/commit/2c459cd2ab8822f0364c1ce8e473cf0487b294a8), [`d220519`](https://github.com/JSPrismarine/JSPrismarine/commit/d220519e2e460148a90cbde9d643033e27bf8f5e), [`2d20fee`](https://github.com/JSPrismarine/JSPrismarine/commit/2d20fee23b5fd58cf78dfa12b266f074dab110b8), [`bbda9ea`](https://github.com/JSPrismarine/JSPrismarine/commit/bbda9ea5c0ed57fe60e93c25d6131234a7e8e049), [`f198a15`](https://github.com/JSPrismarine/JSPrismarine/commit/f198a156a8c307c941efd01a4bd4604eba0f5626), [`c1591b1`](https://github.com/JSPrismarine/JSPrismarine/commit/c1591b1e567a51dc80ecbbdfdbdc8e7c7f4f6c42), [`b96ce93`](https://github.com/JSPrismarine/JSPrismarine/commit/b96ce93238f3efd66c709f213cd8d5d42fc8f425), [`ef39583`](https://github.com/JSPrismarine/JSPrismarine/commit/ef395830d28b1b242b20a7246c8bb6ec781f5f4c), [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c), [`cd01052`](https://github.com/JSPrismarine/JSPrismarine/commit/cd01052548178421cd323b316d77d87374cee9dc)]:
  - @jsprismarine/items@0.16.0
  - @jsprismarine/content@0.16.0
