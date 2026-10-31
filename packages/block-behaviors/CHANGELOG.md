# @jsprismarine/block-behaviors

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f3fa1c6`](https://github.com/JSPrismarine/JSPrismarine/commit/f3fa1c6bf9096223ac9d2b0396bcc71cd04e244e) Thanks [@filiphsps](https://github.com/filiphsps)! - Carry the held item and the clicked face on the block hooks, and use them.
  
  `BlockPlaceEvent`, `BlockBreakEvent` and `BlockPlayerInteractEvent` gain `itemStack`, under Mojang's
  own field name, typed as a `HookItem`: an identifier plus a `get(name)` component reader.
  `@jsprismarine/items`'s `ItemStack` satisfies it structurally, so neither package imports the other.
  `BlockPlaceEvent` also gains `face` and `faceLocation`, the pair Mojang's `PlayerPlaceBlockBeforeEvent`
  carries, and `faceLocation` is now a `FaceLocation` rather than a `BlockPosition` because its
  components are fractions of a block.
  
  With those, `@jsprismarine/block-behaviors` replaces the workarounds it had listed as partial:
  honeycomb waxing and axe scraping across the six copper families, honeycomb sealing a sign, silk
  touch on glass and ice, shears on leaves, vines and lichens, buckets and bottles against liquids and
  the cauldron, flint and steel on candles, campfires and TNT, a pillar's axis from the clicked face,
  and a slab's half and a stair's flip from the click position. The test harness gains `heldItem`,
  `silkTouchTool`, and `face`, `faceLocation` and `itemStack` options on `place`, `breakBlock` and
  `interact`.
  
  Both bumps are `minor`. Adding required fields to the three event types is a breaking change, and
  per the versioning policy a breaking change below `1.0.0` is a `minor`. Anything that builds one of
  these events by hand, including a test double, has to add the new fields; `FamilyHarness.breakBlock`
  now takes an options object in place of its second positional argument.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`fd8d132`](https://github.com/JSPrismarine/JSPrismarine/commit/fd8d132d15fb3e3d98e2dc4b00ec2676ce16e6b1) Thanks [@filiphsps](https://github.com/filiphsps)! - Attach vanilla block behavior families only through the `jsprismarine:behavior` component. Direct
  block resolvers must load the vanilla overlay to receive vanilla block behavior.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`99ab5fc`](https://github.com/JSPrismarine/JSPrismarine/commit/99ab5fc9a3d5c7351877091d58e1a1c0da4c4ef2) Thanks [@filiphsps](https://github.com/filiphsps)! - Use Java infiniburn tags and resolved flammability components for fire.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`760fe99`](https://github.com/JSPrismarine/JSPrismarine/commit/760fe99a8336fdaf1fdf38ef8b097da1dd199a1d) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/block-behaviors`, the vanilla block behavior families.
  
  Every component in `@jsprismarine/blocks` returns `{}`, so the palette resolves with no behavior
  until something fills the `BlockHooks` seam. This package fills it with 49 families covering all
  1477 palette blocks, written against a `WorldActions` interface that names everything a block does
  to the world and nothing a server class owns. `registerVanillaBlockBehaviors(registry, world)` wires
  them to a `BehaviorRegistry`, and a `VoxelWorld` test double plus a per-hook harness ship with it so
  a plugin can test its own family the same way.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e17199e`](https://github.com/JSPrismarine/JSPrismarine/commit/e17199e28be25659495b398dc05d6a48baa2b593) Thanks [@filiphsps](https://github.com/filiphsps)! - Use the interaction rotation from PlayerAuthInput when orienting placed blocks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bd32c08`](https://github.com/JSPrismarine/JSPrismarine/commit/bd32c08eac967ec9e0068cd56cf1788053539a6b) Thanks [@filiphsps](https://github.com/filiphsps)! - Move slope-directed fluid flow, falling levels, and source conversion into the data-driven liquid family.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c05aede`](https://github.com/JSPrismarine/JSPrismarine/commit/c05aede46fe83da30912ee8c20c99984fc313f9a) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop an extinguished campfire fizzing at every neighbor change. The water check ran whatever state
  the campfire was in and played `random.fizz` after it, so a campfire already out under water hissed
  again each time anything beside it changed. It now returns when the campfire is already
  extinguished, which is the guard the candle rule next to it already had.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`ca2b1d0`](https://github.com/JSPrismarine/JSPrismarine/commit/ca2b1d0607a3ee8dba90b78175870044266934b4) Thanks [@filiphsps](https://github.com/filiphsps)! - Face a placed chest or furnace toward its placer, matching Java's `ChestBlock` and `AbstractFurnaceBlock` placement rules; campfires keep lying along the placer's look direction.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`af7c3fb`](https://github.com/JSPrismarine/JSPrismarine/commit/af7c3fb379ae8a76c488bb5bb282ca482995acc8) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep a stack's enchantments, durability, name, lore and contents in a block container. `ItemDrop`
  was `{ identifier, count }` and a container's slots are drops, so a player who put an enchanted,
  damaged or anvil-named pickaxe into a chest got a plain one back. The same drop is what a block
  break, a loot roll and a piston move carry, so the loss showed up wherever a stack passed through a
  block.
  
  `ItemDrop` now also carries `meta`, `damage`, `customName`, `lore`, `enchantments` and the
  `contents` of a container item, and every seam that produces or consumes one carries them with it.
  A container block entity writes them into Bedrock's own item compound through
  `inventory/itemNbt.ts`, which is now the one statement of that compound: the player codec writes
  its stacks through the same module, so a chest and a player's inventory keep the same things and a
  chest this server wrote is still a chest a vanilla tool reads. Enchantments go out twice for the
  reason the player codec already gave, Bedrock's numbers under `ench` and the Java ids beside them,
  because `ench` has no number for Sweeping Edge or for a datapack's enchantment.
  
  A rolled loot stack keeps what Java's table put on it. The three callers that roll a table, a block
  break, a mob death and `/loot`, read the id and the count and dropped the data components, so an
  enchanted book out of a chest table arrived unenchanted.
  
  A shulker box now survives being broken. It already refused to spill its contents, and kept them
  nowhere: the block entity died with the block. The box leaves on the ground carrying its slots,
  through the family's own drop and through the `copy_components` in Java's shulker box table alike,
  and putting it back down puts the items back in it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4ebf807`](https://github.com/JSPrismarine/JSPrismarine/commit/4ebf807cb8ce8e1cbf6b1d85d204f072a55f7b5a) Thanks [@filiphsps](https://github.com/filiphsps)! - Dispatch scheduled block and liquid ticks through resolved content hooks before engine fallbacks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5f40641`](https://github.com/JSPrismarine/JSPrismarine/commit/5f406411e3ccde1c42207e66949b5c93429ffccb) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix piston orientation and redstone dust placement

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9f58b70`](https://github.com/JSPrismarine/JSPrismarine/commit/9f58b7012e39f08ef869149252312f3617c5d057) Thanks [@filiphsps](https://github.com/filiphsps)! - Dispatch entity home-block events through block behavior hooks.

- [#2639](https://github.com/JSPrismarine/JSPrismarine/pull/2639) [`6f75f38`](https://github.com/JSPrismarine/JSPrismarine/commit/6f75f3808e7b5ddebcd16fa5a9f9dd33787f8043) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix bamboo support checks so roots on valid blocks survive neighbor updates.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3ce20e2`](https://github.com/JSPrismarine/JSPrismarine/commit/3ce20e248ddf68967062a79a0b5766bf8ac4fa8c) Thanks [@filiphsps](https://github.com/filiphsps)! - Run every destroyed block through one path.
  
  A blast, a stream of water, a piston, fire and a falling block each took blocks out with a rule
  of their own, and none of them raised the block's `onBreak`. A chest the TNT caught kept its
  contents, a double chest left its other half paired to air, and what fell was a hardcoded copy
  of the block rather than Java's loot table.
  
  `WorldAccess` gains `destroyBlock`, which the host answers by running the same path a player's
  break takes: the hook before the write, then the roll with whatever the caller knows, the blast
  radius for an explosion and nothing at all for a plank the fire burned. It also gains
  `moveBlock`, so a pushed block carries its block entity instead of being written twice and
  arriving empty. `WorldAccess.spawnItem` is gone with them.
  
  `World` now raises `onNeighborChanged` for every block write rather than only for the content
  adapter's own, so a torch whose support a command or a generator removed finally hears about it.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`e578a2f`](https://github.com/JSPrismarine/JSPrismarine/commit/e578a2f231be55ebc222cd4c0579b6276304a515) Thanks [@filiphsps](https://github.com/filiphsps)! - Store a placed door's `minecraft:cardinal_direction` a quarter turn clockwise of the placer's look direction, which is how Bedrock spells Java's unopposed door `facing`; doors were a quarter turn off vanilla.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d231208`](https://github.com/JSPrismarine/JSPrismarine/commit/d231208b7ed03ea5f62f14a2f72741881b57f128) Thanks [@filiphsps](https://github.com/filiphsps)! - Route observer pulses through block family hooks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d220519`](https://github.com/JSPrismarine/JSPrismarine/commit/d220519e2e460148a90cbde9d643033e27bf8f5e) Thanks [@filiphsps](https://github.com/filiphsps)! - Select block behavior from loaded component data

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`3baa83c`](https://github.com/JSPrismarine/JSPrismarine/commit/3baa83c92db539f0b095d32ec434fc41e2420a0b) Thanks [@filiphsps](https://github.com/filiphsps)! - Face a placed `end_portal_frame` opposite its placer, Java's `EndPortalFrameBlock.getStateForPlacement` rule. Every frame used to keep the default `south` facing, so twelve placed frames could never form the inward-facing ring and the end portal could not be created in creative.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`276ebd1`](https://github.com/JSPrismarine/JSPrismarine/commit/276ebd1a17e2876e128b41321145a816df6e8918) Thanks [@filiphsps](https://github.com/filiphsps)! - Move redstone placement updates and piston movement into data-driven block families

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`fb05654`](https://github.com/JSPrismarine/JSPrismarine/commit/fb05654bbe320a1aa3638813de8ef930ad4bff0e) Thanks [@filiphsps](https://github.com/filiphsps)! - Leave an emptied flower pot reading as empty.
  
  `flowerPotFamily.onPlayerInteract` set `update_bit` right after taking the plant out. On a flower
  pot `update_bit` is the contents flag and `false` is an empty pot, so the pot ended every
  interaction claiming to hold the plant the player had just removed.
  
  It was on the wire too. The write moved the runtime id, so the server sent a block-change packet
  carrying `minecraft:flower_pot[update_bit=1]`, a state the Java-to-Bedrock table never emits: all
  40 Java `potted_*` blocks and the empty `minecraft:flower_pot` collapse onto `update_bit=0`,
  because the plant travels in the block entity's `PlantBlock` rather than in the state. The write
  also took the pot's block entity with it, since writing a block clears the block entity at that
  position, so the `{ items: [undefined], capacity: 1 }` record the family had just written was
  gone again a line later.
  
  Emptying a pot now writes `update_bit: false`. Measured over the real content adapter and a real
  `World`: the state after emptying went from `update_bit=1` to `update_bit=0`, the block-change
  packets went from 1 to 0 because the write no longer moves the runtime id, and the pot keeps its
  block entity with one empty slot. A pot that arrived with the flag set, from a command or an
  imported world, is corrected rather than left lying.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`832be6b`](https://github.com/JSPrismarine/JSPrismarine/commit/832be6b0f6dece7ba5b7b57c92b657cf33c3b7d2) Thanks [@filiphsps](https://github.com/filiphsps)! - Fill an end portal frame's eye only when the player holds an eye of ender; a bare hand or any other item leaves the frame empty. The eye of ender item behavior no longer carries its own unreachable frame-filling `onUseOn`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`83b0493`](https://github.com/JSPrismarine/JSPrismarine/commit/83b049364b3c6137f74a7eb1a808a14e692eeeae) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix side fire updates and piston arm replication

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a4abb61`](https://github.com/JSPrismarine/JSPrismarine/commit/a4abb61b7a03101b4f22ebab35da281066530430) Thanks [@filiphsps](https://github.com/filiphsps)! - Add reusable access to state-specific `minecraft:light_dampening` data. Grass and mycelium now turn to dirt only beneath a dark cover that blocks more than two light levels.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c8ed1c5`](https://github.com/JSPrismarine/JSPrismarine/commit/c8ed1c5b88953b3f5f1e3ccec99e8de623faeeb2) Thanks [@filiphsps](https://github.com/filiphsps)! - Route redstone torch ticks through block family hooks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a07c949`](https://github.com/JSPrismarine/JSPrismarine/commit/a07c94977978f0536b56a29630729bdb817cbba0) Thanks [@filiphsps](https://github.com/filiphsps)! - Decay leaves at Java's distance and stop a drop burst from taking the server down.
  
  `MAX_LEAF_DISTANCE` was 4, which is Bedrock's rule, and the trees it was applied to are built
  from Java's `worldgen/feature` data. `LeavesBlock` in the pinned 26.3 server jar has
  `DECAY_DISTANCE` 7 and decays a leaf whose `distance` state has reached it, so 6 is the last
  distance that survives; `updateDistance` takes one more than the smallest of the six neighbors',
  counting a block in `#minecraft:prevents_nearby_leaf_decay` as 0, and the fixed point of that is
  the breadth-first distance from the nearest log through leaves. `TreeFeature.updateLeaves` writes
  those distances out to 6 when the tree is generated. The radius-4 rule therefore condemned the
  outer rings of every canopy the generator placed: 59 of one chunk's 1173 leaves against the 4
  Java condemns, each one a break that rolls for a sapling. Java decides this on its own, and
  Bedrock has nowhere to disagree, because all seven of Java's `distance` values collapse onto the
  two Bedrock leaf states that differ only in `persistent_bit`.
  
  A position the decay search cannot read now counts as holding the leaf up, which is what
  `BlockPhysics` already assumes about ground it cannot read, so a canopy at the edge of the loaded
  world no longer decays for want of a chunk. `mushroom_stem` is no longer treated as a log, since
  Java leaves it out of `#minecraft:logs`.
  
  `World` now holds at most `ITEM_ENTITY_LIMIT` dropped stacks and turns the rest away with a
  warning once a second. Nothing capped this before: one tick is allowed 4096 block updates, every
  one of which can destroy a block and roll its loot table, and the reported failure was more than
  10,000 item entities falling, merging and broadcasting at once.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`710f60e`](https://github.com/JSPrismarine/JSPrismarine/commit/710f60e077c7c9a8471436669e123e6796b13c4d) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop leaves from flipping `update_bit`, which never settled.
  
  `leavesFamily` set `update_bit` on a neighbor change and cleared it on the scheduled tick that
  followed. Nothing read it back: `hasNearbyLog` walks the canopy from scratch on every random
  tick, so the flag gated no decision. It was not free, and it was not a one-off either. The
  clearing write notified the six neighbors, every un-flagged leaf among them flagged itself and
  scheduled its own tick, and the canopy never reached a fixed point. Removing one log under a
  17-leaf canopy churned 32 block writes per tick indefinitely, 16019 over 500 ticks; breaking one
  corner off a 125-leaf slab churned 248 a tick, 124125 over the same span. Both now cost the one
  write that caused them. Each avoided write also carried a block-change packet to every player in
  range, a light update, seven scheduled physics positions and six more neighbor notifications, and
  leaves now fall out of the neighbor walk entirely because the family declares no reaction to it.
  
  Java has no equivalent state. It recomputes a leaf's `distance` when a neighbor changes, and all
  seven of those values collapse onto the two Bedrock leaf states that differ only in
  `persistent_bit`. `update_bit` is the Bedrock engine's own marker for the same check, and the
  Java-to-Bedrock block table never emits it set, so no client has ever been shown a leaf with it
  on. Decay is unchanged: 8519 leaves generated across 36 chunks at seed 1234 and none decays,
  before or after, while the same leaves with their logs stripped all 8519 decay.
  
  One side effect is a fix rather than a saving. `minecraft:oak_leaves` carries
  `randomTick: false` with a `persistent_bit=0,update_bit=0` override that turns it on, so a leaf
  holding the flag was skipped by the random-tick draw. Leaves that kept it, through a scheduled
  tick lost to a chunk unload, would never have decayed at all.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`de6e39c`](https://github.com/JSPrismarine/JSPrismarine/commit/de6e39c1520b6fbaaa031eaebd6914fd4fcccfad) Thanks [@filiphsps](https://github.com/filiphsps)! - Face a placed lectern toward its placer, matching Java's `LecternBlock` placement rule; lecterns kept the palette default facing because no family wrote the state.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`507bd0a`](https://github.com/JSPrismarine/JSPrismarine/commit/507bd0a8a76a2b610e70788fa3e4c2bbd7a63710) Thanks [@filiphsps](https://github.com/filiphsps)! - Make lit TNT detonate. Flint and steel and a redstone signal both already cleared the TNT block and spawned a `minecraft:tnt` entity with a fuse, but the entity was an empty class that read no fuse and never went off, so the only live explosion in the server was a creeper's and a player could not blow anything up.
  
  The entity is now Java's `PrimedTnt`: 80 ticks, the hop its launch speed and gravity make, and a radius-4 blast through the existing ray cast, gated on the `tntexplodes` game rule. A blast that reaches another TNT block lights it with `getRandomShortFuse`'s 10 to 29 ticks and drops no item, which is Java's `TntBlock.wasExploded`, so a pile of TNT chains and ripples outward instead of going off at once. The blame is carried through the chain, so a kill three blasts down the line is still the first lighter's.

- [#2648](https://github.com/JSPrismarine/JSPrismarine/pull/2648) [`5053f00`](https://github.com/JSPrismarine/JSPrismarine/commit/5053f003598eab2d2d7cc59338e5ad9ab55d3232) Thanks [@filiphsps](https://github.com/filiphsps)! - Preserve supported foliage during neighbor updates

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`aecc83d`](https://github.com/JSPrismarine/JSPrismarine/commit/aecc83db4d7be989977510a5dae1e7ada44b689b) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix Java-parity block placement, crafting variants, and player item drops

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b3360c0`](https://github.com/JSPrismarine/JSPrismarine/commit/b3360c05087155a4aa71299a2042646fa91d6f14) Thanks [@filiphsps](https://github.com/filiphsps)! - Route repeater and comparator updates and scheduled transitions through their data-driven block behavior hooks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`fd43ade`](https://github.com/JSPrismarine/JSPrismarine/commit/fd43ade59e80f19e3e7ef994ca80adb15e1f7907) Thanks [@filiphsps](https://github.com/filiphsps)! - Send the last two drops that bypassed it through the one destruction path.
  
  `EntityRuntime.breakBlock`, which is how a mob harvests, wrote air and then rolled the block's
  table with no tool, no position and no level view. It was the last of the four drop mechanisms
  that were consolidated: a chest a villager harvested over kept what it held, and every table
  condition that reads where the break happened refused. It now calls the host's `destroyBlock`
  first and writes air afterwards, and keeps the bare roll as the fallback for a host with no live
  world behind it.
  
  `rules/support.ts`'s `popBlock` dropped one of the block it popped, which is a guess: deepslate
  yields cobbled deepslate, a popped crop yields its seeds, and a block with no table yields
  nothing. On the player path `blockBreak.ts` reconciles that stand-in through `spilledContents`,
  but a piston's popped block, a block that lost its support and a block a falling anvil cleared
  out of the way all went straight to the ground with it.
  
  `WorldActions` gains an optional `destroyBlock`, which the server fills from the same path, so
  those three raise the block's `onBreak` and roll Java's table. The self-drop stays as the answer
  for a world with no tables behind it, which is the test voxel world. The seam runs
  `ContentBlockAccess.destroy`, `BlockStorageAccess.destroy` and `worldBlockStorage`, all optional
  for the same reason: only a storage over a live world can tell a family's own drops apart from
  the table's roll.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`e60d525`](https://github.com/JSPrismarine/JSPrismarine/commit/e60d525e436fb4b7d1cf0748d0966d45eedc184e) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `rules/portal.ts`, the portal geometry rules: Java's `PortalShape` frame scan, the end portal frame ring match, the `PortalForcer` creation search and the portal and End platform writers. `portalFamily` lights a frame when fire appears inside it, collapses a portal when a frame block goes, fills a complete end portal ring with `end_portal`, and rolls the zombified piglin spawn on a portal's random tick. Travel between dimensions stays with the server.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`6bac6b1`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac6b173e5e283b4e6e3d106268319caa51ed40) Thanks [@filiphsps](https://github.com/filiphsps)! - Send `minecraft:end_gateway` to the `jsprismarine:portal` family instead of `jsprismarine:inert`, which used to claim it first, and drop `nether_portal` from `PORTAL_BLOCK_NAMES` because the Bedrock palette only has `minecraft:portal`. The family tallies in both READMEs now match `vanilla_overlay/report.json`.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`ea17f32`](https://github.com/JSPrismarine/JSPrismarine/commit/ea17f32ad6d5550bc720c3d66a55bc8b4eccbb6c) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the review findings on portal travel and the dimension change.
  
  - `PlayerSession.changeWorld` refuses a second change while one is still pending on the
    client's loading screen, and refuses a world of a custom dimension type with an error until a
    real client is seen to accept a `ChangeDimension` with an id of 1000 or more.
    `World.touchPortals` and `DimensionTravel.touch` skip a player with a pending change.
  - A player without a spawn of their own is sent `SetSpawnPosition` naming the level's Overworld
    spawn in the Overworld, where `Player.getRespawnPoint` sends them, instead of the spawn of the
    world they stand in.
  - `PortalIndex.closest` bounds the search on x and z only, as Java's `PoiManager.getInSquare`
    does, and still picks by squared distance including y.
  - `DimensionTravel.touch` awaits `entityPortalEnter` listeners, so an asynchronous listener
    can cancel the contact. `touch` returns a promise.
  - A data-driven mob keeps its runtime record through a portal: the destination runtime restores
    the same entity, component groups included, and its body takes the portal cooldown.
  - `DimensionTravelRule.respawnBlock` is gone; `RespawnPoint` reads the Java attributes.
  - `@jsprismarine/block-behaviors` exports `alongPortalAxis`.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`8e0355a`](https://github.com/JSPrismarine/JSPrismarine/commit/8e0355ae0f6f497f82ecaed6fa4fec714785ff46) Thanks [@filiphsps](https://github.com/filiphsps)! - Turn a placed decorated pot with its placer, matching Java's `DecoratedPotBlock` placement rule; pots kept the palette default `direction` because no family wrote the state.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`59f8ec6`](https://github.com/JSPrismarine/JSPrismarine/commit/59f8ec6fcd56487b167a9641cf74d60601d8af7e) Thanks [@filiphsps](https://github.com/filiphsps)! - Run fire spread, burnout, and scheduled ticks through data-driven block behavior hooks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5e89923`](https://github.com/JSPrismarine/JSPrismarine/commit/5e89923aca9bb066d82f54756dd39ba30e591a0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep berry-bearing cave vines attached to their ceiling support and hanging vine columns during neighbor updates.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1c80f7e`](https://github.com/JSPrismarine/JSPrismarine/commit/1c80f7e0e15c3da3223d21986640428d3fb3044f) Thanks [@filiphsps](https://github.com/filiphsps)! - Map Java repeater and comparator items to placeable Bedrock blocks, and use Java-facing piston directions for redstone behavior.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4c72fc6`](https://github.com/JSPrismarine/JSPrismarine/commit/4c72fc6761f1059209742d493514d279b04ae85a) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop `setStates` from writing a block whose states did not move.
  
  Every family rewrites its block through `setStates`, and the write is not free: it notifies the
  six neighbors. Five families recompute a derived state when a neighbor changes without first
  asking whether it moved, which is the wall, fence and pane connections, scaffolding's
  `stability` and the campfire's `extinguished`. Each rewrote its unchanged value and notified
  back, so two neighbors of the same family kept handing the notification to each other and a
  settled run never reached a fixed point. Only the chained-update cap of one million stopped it.
  The stairs corner, the fence gate's `in_wall_bit` and the redstone diodes already compared
  before writing; this moves that check into the one place every family goes through.
  
  Measured over the real content adapter and a real `World`. One notification on a settled
  four-block scaffolding run spent 9.5 seconds inside a single tick; it now costs nothing. Putting
  a support under a six-block run took 14.2 seconds and left the run wrong, because the cap fired
  before the recompute had walked past the third block and the last three kept `stability=7`,
  which is the value `climbingFamily.onTick` pops a scaffolding for. The same change now takes 1.2
  seconds, walks the whole run to 0, 1, 2, 3, 4, 5, and sends 7 block-change packets.
  
  The propagation the recompute depends on is unchanged, because a value that genuinely moves
  still writes and still notifies. A boolean compares equal to the 0 or 1 the wire carries, so a
  family computing `false` against a chunk holding `0` counts as settled.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4ab02e5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ab02e5cf76b88f09ba19106e971337c1da2d1b9) Thanks [@filiphsps](https://github.com/filiphsps)! - Pass sneak state to block interactions so copper doors and trapdoors can wax or scrape correctly.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d0b36e7`](https://github.com/JSPrismarine/JSPrismarine/commit/d0b36e7d517f9f057cadbc261c6a77d3cb58329a) Thanks [@filiphsps](https://github.com/filiphsps)! - Route server fluid ticks through data-driven block families, expose liquid state reading from block behaviors, and remove fluid handling from `Engine`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a3db50e`](https://github.com/JSPrismarine/JSPrismarine/commit/a3db50eef709e1d2e3848d71383d6801d5f69773) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply correct-tool rules to block loot and family drops.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cc8b110`](https://github.com/JSPrismarine/JSPrismarine/commit/cc8b1109b9c174940cdd4549615a05affb459b9a) Thanks [@filiphsps](https://github.com/filiphsps)! - Play container open sounds once per open using block data

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`32ce6f2`](https://github.com/JSPrismarine/JSPrismarine/commit/32ce6f2f752e7e89c4445d1936e13a6e243a3a30) Thanks [@filiphsps](https://github.com/filiphsps)! - Preserve Java water states for kelp and water plants during fluid spread, and use Java's sturdy-face rule for kelp support.

- [#2645](https://github.com/JSPrismarine/JSPrismarine/pull/2645) [`fafc156`](https://github.com/JSPrismarine/JSPrismarine/commit/fafc15668419770e6bd847d39e2a9e0656427cb9) Thanks [@filiphsps](https://github.com/filiphsps)! - Reset stalk growth through each block's cataloged counter state.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`68fe15f`](https://github.com/JSPrismarine/JSPrismarine/commit/68fe15f5e63d3b46c19bc333510c0e79a5a236ad) Thanks [@filiphsps](https://github.com/filiphsps)! - Give a placed trapdoor its facing and half, matching Java's `TrapDoorBlock` placement rule: a side click hangs it on the clicked face, a vertical click opposes the placer, and a click in the upper half of a face or on the underside of a block sets `upside_down_bit`. Trapdoors kept the palette default because no family wrote the states.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`a645006`](https://github.com/JSPrismarine/JSPrismarine/commit/a645006caa290b45c728b7ad87435249091cbd56) Thanks [@filiphsps](https://github.com/filiphsps)! - Carry an `onUseOn` behavior's stack result back to the player's hand, so bone meal and other consumables used on a block are spent. An `onPlayerInteract` block hook can now answer with `{ consumed: true, consumesHeldItem: true }`, which the interaction dispatch charges to the hand outside creative; the portal family uses it to spend the eye of ender that fills an end portal frame.
- Updated dependencies [[`428fd29`](https://github.com/JSPrismarine/JSPrismarine/commit/428fd2953c93ea8472696575798735a4a36ec51b), [`232a1ce`](https://github.com/JSPrismarine/JSPrismarine/commit/232a1ce20b5ade2e33b703300fb671f0c3f62076), [`ea083fb`](https://github.com/JSPrismarine/JSPrismarine/commit/ea083fb8d67d0c285724b73bf94b41947afc4013), [`f33a57c`](https://github.com/JSPrismarine/JSPrismarine/commit/f33a57c3750488f1ed77a441ab26b7c1086eff68), [`cde1039`](https://github.com/JSPrismarine/JSPrismarine/commit/cde1039d276df8d3787b361e072fafdb32a6da9a), [`f3fa1c6`](https://github.com/JSPrismarine/JSPrismarine/commit/f3fa1c6bf9096223ac9d2b0396bcc71cd04e244e), [`57f252b`](https://github.com/JSPrismarine/JSPrismarine/commit/57f252b2781508290fac2e842cf37fb652467d66), [`f8a43ce`](https://github.com/JSPrismarine/JSPrismarine/commit/f8a43ce910da3d8e1c88091c8886a7c1d09ab0c0), [`d4afedd`](https://github.com/JSPrismarine/JSPrismarine/commit/d4afeddfc1a6016173261b800813e9f248208db8), [`89a02c8`](https://github.com/JSPrismarine/JSPrismarine/commit/89a02c81dd66293ab2b303851aad61c891535081), [`bfb9a31`](https://github.com/JSPrismarine/JSPrismarine/commit/bfb9a31a40c8173f1b811ee63b2308f357c47fd0), [`b6eccf4`](https://github.com/JSPrismarine/JSPrismarine/commit/b6eccf49493ed702c5c13eb831ad9fa54258a47d), [`e17199e`](https://github.com/JSPrismarine/JSPrismarine/commit/e17199e28be25659495b398dc05d6a48baa2b593), [`18f0d0c`](https://github.com/JSPrismarine/JSPrismarine/commit/18f0d0ca7bfb691c75d2d2453eb21b0126e4a4e3), [`d4a2a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/d4a2a0b2787e171583e6db0aec1b750e8aeb1e95), [`9f58b70`](https://github.com/JSPrismarine/JSPrismarine/commit/9f58b7012e39f08ef869149252312f3617c5d057), [`440e164`](https://github.com/JSPrismarine/JSPrismarine/commit/440e164b88f43548c9c4fe8ae896387157f21701), [`d220519`](https://github.com/JSPrismarine/JSPrismarine/commit/d220519e2e460148a90cbde9d643033e27bf8f5e), [`e678a6a`](https://github.com/JSPrismarine/JSPrismarine/commit/e678a6a48dd00568f1186f37f2d460b1c898f059), [`a540a4c`](https://github.com/JSPrismarine/JSPrismarine/commit/a540a4cc5879f62d5d3b39d59100200af8e3d313), [`a4abb61`](https://github.com/JSPrismarine/JSPrismarine/commit/a4abb61b7a03101b4f22ebab35da281066530430), [`f370405`](https://github.com/JSPrismarine/JSPrismarine/commit/f37040563ed0cac590fe971ef3a448cb2e01a581), [`c1591b1`](https://github.com/JSPrismarine/JSPrismarine/commit/c1591b1e567a51dc80ecbbdfdbdc8e7c7f4f6c42), [`c9cafc8`](https://github.com/JSPrismarine/JSPrismarine/commit/c9cafc8529e05fe90ea2812920feb76cbcaf4a1b), [`8518afc`](https://github.com/JSPrismarine/JSPrismarine/commit/8518afc7b9ee684ebe4255ce26e7b56d612a145a), [`08de1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/08de1bac21f3c5785a02649e4faa11d9a11f82b0), [`5e47439`](https://github.com/JSPrismarine/JSPrismarine/commit/5e474396321b54f696760962ceb9d24b85917640), [`fc10888`](https://github.com/JSPrismarine/JSPrismarine/commit/fc10888391866037519afbf8e057d4ecece48757), [`6bac6b1`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac6b173e5e283b4e6e3d106268319caa51ed40), [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a), [`4ab02e5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ab02e5cf76b88f09ba19106e971337c1da2d1b9), [`a3db50e`](https://github.com/JSPrismarine/JSPrismarine/commit/a3db50eef709e1d2e3848d71383d6801d5f69773), [`cc8b110`](https://github.com/JSPrismarine/JSPrismarine/commit/cc8b1109b9c174940cdd4549615a05affb459b9a), [`32ce6f2`](https://github.com/JSPrismarine/JSPrismarine/commit/32ce6f2f752e7e89c4445d1936e13a6e243a3a30), [`35e7df5`](https://github.com/JSPrismarine/JSPrismarine/commit/35e7df54b5bba03f65c9e3a972bac32b01ba4fe4), [`13792da`](https://github.com/JSPrismarine/JSPrismarine/commit/13792daea4f024f559c9392e93328694db22e164), [`9e53c61`](https://github.com/JSPrismarine/JSPrismarine/commit/9e53c61399266bf9e26dd87160c45ccd251a21f8), [`a645006`](https://github.com/JSPrismarine/JSPrismarine/commit/a645006caa290b45c728b7ad87435249091cbd56), [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c)]:
  - @jsprismarine/mapping@0.16.0
  - @jsprismarine/blocks@0.16.0
  - @jsprismarine/content@0.16.0
