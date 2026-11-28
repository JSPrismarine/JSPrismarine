# @jsprismarine/block-behaviors

What a block does. `@jsprismarine/blocks` says what a block is: its components, its states and its
place in the palette. Every component factory there returns `{}`, so all 1477 vanilla blocks resolve
with no behavior at all until this package registers one.

A behavior is a named set of handlers over `BlockHooks`, attached by family rather than by block, so
50 families cover the whole palette. One call wires them up:

```typescript
import { BehaviorRegistry } from '@jsprismarine/content';
import { type BlockHooks, resolveBlocks } from '@jsprismarine/blocks';
import { registerVanillaBlockBehaviors } from '@jsprismarine/block-behaviors';

const behaviors = new BehaviorRegistry<BlockHooks>();
registerVanillaBlockBehaviors(behaviors, world);

resolveBlocks(definitions.blocks.values(), { behaviors });
```

The vanilla overlay writes each block's family into `jsprismarine:behavior`, and the selector reads
that value when the definition resolves. A later pack can assign a registered family to a block by
setting the same component. Definitions without it receive no vanilla behavior, so callers that
resolve blocks directly must include the `jsprismarine_vanilla` overlay when they want vanilla block
families.

`world` is the second argument because a handler has to reach the world and no hook event carries
one. It is a `BlockWorld`, described below.

## The world interface

`WorldActions` is everything a block does to the world, and the whole of what a family may use:

| Group | Methods |
| --- | --- |
| Blocks | `getBlock`, `setBlock`, `propertiesOf`, `lightDampeningOf`, `flammabilityOf`, `hasBlockTag`, `hasSturdyTopFace`, `isSolid`, `isFaceSturdy` |
| Items and entities | `dropItem`, `destroyBlock`, `spawnEntity`, `removeEntity`, `entitiesAt` |
| Effects | `playSound`, `spawnParticle` |
| Scheduling | `scheduleTick(position, delay, kind?, priority?)`, `willTickThisTick` |
| Block entities | `getBlockData`, `setBlockData` |
| Updates | `notifyNeighbors`, `redstonePower`, `redstoneSignal`, `redstoneDirectSignal`, `redstoneConductor`, `lightLevel` |
| Commands | `runCommand`, which runs a command as a command block at a position |
| Environment and chance | `difficulty`, `weather`, `isRainingAt`, `canFireSpreadAround`, `random`, `randomInt`, `randomFloat` |

Several of those are there for reasons worth stating. `propertiesOf` returns another block's
`jsprismarine:block_properties`, which is how the piston and the falling blocks read `push_reaction`
instead of carrying a list. `random` is on the interface rather than inside the families so a test
`flammabilityOf` reads the resolved state's `minecraft:flammable` component, so a pack can change
fire odds in a permutation. Fire uses the loaded `minecraft:infiniburn_*` block tags to decide which
fuel keeps it burning forever. `hasSturdyTopFace` lets the host answer from the block's collision
shape. `isSolid` answers Java's legacy solid flag, which a new fluid source asks of the block below
it and a portal of its floor; a host without it gets the full cube test for fluids and the push
reaction test for portals. `isFaceSturdy(block, face, type)` answers Java's face sturdiness for a
full, center or rigid support. With the two, a placed or neighboring sign, banner, ladder, bell,
lantern, lever, button, tripwire hook or coral fan follows its own Java survival rule: a sign wants a
solid block, a ladder a sturdy face toward it, a lantern a sturdy center. A host without
`isFaceSturdy` gets `hasSturdyTopFace` for a top face, `isFullCube` for a bottom one and the push
reaction test for the rest. `destroyBlock` is how a family takes a block out that it is not itself: the host raises its
`onBreak` and rolls Java's loot table for it, where this package would otherwise have to guess that
the block drops one of itself. It is optional, and a host that leaves it out gets that guess, which
is what the test voxel world does. Fire passes `drops: false` so a burned block leaves no loot while
still running its break hook. `popBlock` is the one rule that uses the default drop behavior, and the
piston's popped block, a block that lost its support and a block a falling anvil cleared out of the
way all go through it.

`lightDampeningOf` can read a block state's vanilla `minecraft:light_dampening` value, so rules can
check how much light a cover blocks without treating every support block as opaque. When a host
cannot report dampening, the shared rule treats it as unknown and does not convert the ground block.

Scheduled hooks run from the active block state before the engine fallback. Observer pulses,
redstone torch burnout, repeater transitions, comparator output updates, and fire spread run
through their family hooks. `kind` selects the block or fluid tick list and defaults to `block`;
water and lava use the fluid list so their family tick shares the engine's existing liquid schedule,
and a bubble column, which is not a liquid of its own, uses the block list.

A `BlockWorld` is a set of dimensions, and `at(dimension)` returns the `WorldActions` for one. Each
handler receives the actions for its own event's dimension already resolved, so the dimension never
appears in a family's code. A server with one world passes `singleDimensionWorld(actions)`.

Nothing here names a server class. The events are structural, the world is an interface, and the
package depends on `@jsprismarine/blocks`, `@jsprismarine/content`, and `@jsprismarine/mapping`.

## Testing a family

`VoxelWorld` is a real implementation of the interface over a map of positions, not a mock: writes
read back, and every drop, sound, particle, scheduled tick, spawned entity and neighbor notice is
recorded in order. `bindFamily` binds one family to one identifier through the same `create` path the
registry runs, and gives a method per hook, including `entityEvent(position, name, source)`:

```typescript
const harness = bindFamily(doorFamily, 'minecraft:wooden_door');
harness.dimension.set({ x: 0, y: 0, z: 0 }, 'minecraft:stone');
harness.dimension.set({ x: 0, y: 1, z: 0 }, 'minecraft:wooden_door', { open_bit: false });

harness.interact({ x: 0, y: 1, z: 0 });

harness.dimension.stateAt({ x: 0, y: 1, z: 0 }, 'open_bit'); // true
```

`heldItem` and `silkTouchTool` build the `HookItem` the hooks carry, so a test for waxing, shearing
or silk touch names an item the same way a server passes one:

```typescript
harness.interact(position, { itemStack: heldItem('minecraft:honeycomb') });
harness.breakBlock(position, { itemStack: silkTouchTool() });
harness.place(position, { face: 'north', faceLocation: { x: 0.5, y: 0.9, z: 0 } });
```

Both ship in the published package, because a plugin writing its own family wants the same harness.

## The held item and the clicked face

`onPlace`, `onBreak` and `onPlayerInteract` carry `itemStack`, a `HookItem` with an identifier and a
component reader, and `onPlace` carries the clicked `face` and `faceLocation` as well. Together they
are what lets a block behavior answer a question about the hand rather than deferring it:

| What the item decides | Where |
| --- | --- |
| Honeycomb waxes copper, an axe scrapes it | `copper`, `slab`, `double_slab`, `stairs`, `fence`, `lantern`, `door`, `trapdoor` |
| Honeycomb seals a sign against edits | `sign` |
| Silk touch takes glass and ice whole | `glass`, `ice` |
| Shears or silk touch take leaves, vines and lichens whole | `leaves`, `climbing` |
| A bucket or a bottle fills and empties | `cauldron` |
| Flint and steel lights it | `candle`, `furnace` (the campfire), `redstone` (TNT) |
| The clicked face gives a pillar its axis | `log` |
| The click position gives a slab its half and a stair its flip | `slab`, `stairs` |
| A placement that replaced the clicked block turns a trapdoor away from the placer and orders a lantern's support by the look | `trapdoor`, `lantern` |

`rules/heldItem.ts` owns the item questions and `rules/placement.ts` the placement ones, so an item
name or an enchantment id is written down once. Neither imports `@jsprismarine/items`: a `HookItem`
is whatever the server hands the hook, and that package's `ItemStack` satisfies the interface
structurally.

The interaction hook also receives whether the player was sneaking. Sneaking with a placeable block
skips the block hook so the block can be placed against a chest or door. Other items reach the hook:
a copper door opens before an axe can scrape it normally, while sneaking lets the same axe scrape it.

## The shared rules

Reusable decisions live in `src/rules/` and the families compose them. Copper weathering is the
clearest case: identifier rules send a copper door to
`jsprismarine:door` and a copper slab to `jsprismarine:slab`, so six families run the same random
tick.

| Rule | What it decides |
| --- | --- |
| `support` | Whether a block holds another up, and what popping one does |
| `gravity` | Which blocks fall, and one step of a fall |
| `weathering` | Reading a copper name into wax, oxidation and shape, and writing it back |
| `connection` | The fence, pane and wall connection states |
| `stairShape` | `minecraft:corner` from the stairs in front and behind |
| `redstone` | Power, wire fading and the pulse lengths |
| `piston` | What a push moves, breaks or refuses, read off `push_reaction` |
| `fluid` | Spread depth and rate, and the stone, cobblestone and obsidian reactions |
| `container` | Slot counts and the comparator's fill-level formula |
| `growth` | Crop chance from farmland moisture, and the leaf distance search |
| `light` | Whether a block state dampens more light than a supplied cutoff |
| `heldItem` | What the item in the hand is: an axe, shears, honeycomb, an igniter, a bucket, a bottle, silk touch |
| `placement` | What the clicked face and the click position say: a pillar's axis, a slab's half |
| `javaPlacement` | Java's `getStateForPlacement` per block class, run over Java's state and mapped back: facings, wall variants, rotations, attach faces and persistent leaves, or a refused placement |
| `dripstone` | Pointed dripstone's tip direction, column thickness and falling stalactites |
| `portal` | Java's `PortalShape` frame scan, the end portal frame ring, where a new nether portal goes and what it writes, the End platform, and the piglin spawn roll |

## Fluid spread against Java

`rules/fluid.ts` copies Java's `FlowingFluid.getSpread`: which sides water and lava flow to, and
what each side receives, with the slope search and the rules it calls. `rules/fluidSpread.test.ts`
compares the copy with answers Java computed. `utils/oracle/` compiles a small Java program
against the pinned server jar. It runs the real `getSpread` over a set of small layouts, each
with a water or lava block at the origin, and writes the answers to
`vectors/<release>/fluid-spread.json`.

The dump also records what a host tells the rule through `WorldActions` about each block state
the layouts use: whether it is a full cube, whether it is solid, whether fluids wash it away,
whether it holds water, and which neighboring pairs close the face between them. The test builds
each layout in the voxel world with a host that gives those answers, runs one flow step, and
checks that it writes the fluid states Java chose. So the test checks the rule, and a host's own
shape tables are the parity suite's to check.

Refresh the vectors with `pnpm --filter @jsprismarine/block-behaviors run vectors`, adding
`-- --java <release>` for a pinned release other than the default. The command prepares the
pinned jar and needs the JDK the jar's `version.json` declares.

## Placement against Java

`javaPlacement` and the chest, lantern, dripstone and trapdoor families copy Java's
`getStateForPlacement`. `src/rules/javaPlacement.vectors.test.ts` checks each copy against what
Java's own method returns, recorded in `vectors/<release>/placement.json`. `utils/oracle/` compiles
a small Java program against the pinned server jar. It runs every block whose placement resolves to
a class this package tags with `@javaSource <Class>.getStateForPlacement`, over a grid of clicked
faces, click positions, looks, neighbor layouts, water at the position and sneaking. No server
starts: Java's real `BlockPlaceContext` reads a `Level` that holds the layout in a map and a player
whose look and sneak flag the program sets, with the vanilla block tags bound from the jar.

The dump also records what the port's world is asked about each neighbor: its push reaction,
whether it is a full cube and whether its top is sturdy. `vectors/placement.ts` builds each layout
in a voxel world that gives those answers, and answers whether a neighbor is solid and which of its
faces are sturdy from the support table in `@jsprismarine/mapping`, as the server does. It places
the block through the port and compares the Bedrock block it puts down with the one Java's answer
maps to. A rule's own Java state is compared
too, for what Bedrock keeps elsewhere, such as a head's rotation. Blocks that answer every placement
alike share one entry, and the test places each of them. `PLACEMENT_GAPS` lists the differences that
stay open, each with its issue, and the parity suite's `placement-vectors` row shows them.

Refresh the vectors with `pnpm --filter @jsprismarine/block-behaviors run vectors`, adding
`-- --java <release>` for a pinned release other than the default. The command prepares the pinned
jar and needs the JDK the jar's `version.json` declares.

## Values come from the block

Where a behavior needs a number, it reads it off the block rather than carrying its own copy.
`jsprismarine:block_properties` is the source for `push_reaction` (the piston and the falling
blocks), `requires_correct_tool` (the drop rule) and `random_tick`. Reading it goes through the
component factory in `@jsprismarine/blocks`, so an absent component reads as that schema's defaults
and a malformed one does too rather than failing the load. `friction` is published for the movement
code and no family reads it, because friction is a decision the entity makes, not the block.
Families emit candidate drops. The content break host checks `requires_correct_tool` against the
held item's `minecraft:tool` rules and merged block tags before releasing loot or family drops.

The state names are the palette's. `geometry.test.ts` checks `CARDINAL_DIRECTIONS` against the
captured palette's `minecraft:cardinal_direction` domain, and `rules/weathering.test.ts` walks every
copper block in the palette and asserts that each name the three transitions produce is a block that
exists.

## Portals

`rules/portal.ts` is the block half of portals: the pure geometry over `WorldActions`, with the
constants Java's `PortalShape`, `PortalForcer` and `EndPlatformFeature` use. `portalFamily` calls
it from four hooks.

| Hook | Block | What happens |
| --- | --- | --- |
| `onPlace` | `fire`, `soul_fire` | `findEmptyPortalShape` scans both axes for an obsidian frame around the fire, 2 to 21 interior blocks wide and 3 to 21 tall with the corners unchecked, and `lightNetherPortal` writes `minecraft:portal` with the frame's `portal_axis` into the interior. Nothing lights in `minecraft:the_end`. |
| `onNeighborChanged` | `portal` | When the neighbor on a vertical face or a face along the portal's axis is neither portal nor obsidian, `collapseNetherPortal` clears every portal block `connectedPortalBlocks` reaches through the plane, in one go. |
| `onPlayerInteract` | `end_portal_frame` | After the eye goes in, `findEndPortalRing` looks for the flat ring of twelve frames, each with an eye and facing the center, and `activateEndPortal` fills the 3 by 3 with `end_portal`. The answer reports that the click cost the eye, which the dispatching server spends from the hand outside creative. |
| `onRandomTick` | `portal` | In the Overworld, `piglinSpawnRoll` is `random() * 2000 < difficultyId`, and a hit spawns `minecraft:zombie_pigman` beside the bottom of the portal: south of a portal on the x axis, east of one on the z axis. |

Two more functions are for the server's travel code rather than for a hook. `portalCreationSite`
is Java's search for where a new portal goes. It visits every column within 16 blocks of the target
in Java's spiral, skips a column outside the world border when the bounds carry one, and walks each
column down from its `MOTION_BLOCKING` height for a replaceable run on a solid floor with room for
the 4 by 5 frame. The first pass wants the footprint plus a block on each side, the second the
footprint alone, and the closest site by 3D distance wins, the first the spiral met on a tie. When
nothing fits the site is forced one block back from the target with y clamped to
`[70, maxY - 10]` and the column clamped into the border. A dimension too short for that range
gets no site, as Java builds nothing there. `writeNetherPortal` writes the frame with corners and
six portal blocks, and for a forced site an obsidian platform with four netherrack blocks on each
side as Bedrock does. `writeEndPlatform` writes the 5 by 5 obsidian platform and three rows of air
above it, destroying what is in the way.

### Portal vectors

`vectors/<release>/portal-creation.json` records what Java's `PortalForcer.createPortal` does in a
set of fixed layouts: open ground, a pillar that leaves equally close sites, a cliff, short grass,
snow and cobwebs, a Nether lava lake and a lava sea, empty dimensions, ground near the build limit,
the Nether roof, a world border and a dimension too short for a forced portal. For each it holds the
layout as cuboid fills, the origin and axis Java chose and every block Java wrote, and for each
block the layouts use the rules the search reads. `src/rules/portal.vectors.test.ts` rebuilds every
layout through `replayPortalVector` in `src/rules/portalVectors.ts`, and the `blocks.portals`
parity row does the same. Both fail when the port builds somewhere Java does not or writes other
blocks. The netherrack beside a forced platform is the one difference they accept. The search
reads a floor through `WorldActions.isSolid`, Java's legacy solid flag, which the replay answers
from the support table in `@jsprismarine/mapping` as the server does, so a portal stands on cobwebs
under a roof as Java's does. A layout the port gets wrong goes into the test's `KNOWN_GAPS` with
its issue.

`utils/oracle/DumpPortalVectors.java` writes the file. It runs Java's own `createPortal` on a
`ServerLevel` subclass that answers the few methods the search calls from a map of block states,
allocated without a constructor so no server has to start, with the vanilla data pack's tags bound.
Refresh the vectors with `pnpm --filter @jsprismarine/block-behaviors run vectors`, adding
`-- --java <release>` for a release other than the default. The script fetches the pinned server
jar when it is missing and needs the JDK the jar's `version.json` declares.

The block list comes from `PORTAL_BLOCK_NAMES` in `@jsprismarine/blocks`, which is the same list
the `jsprismarine:portal` family rule matches on, so the family and the geometry agree on what a
portal, a frame and a fire are.

## The families

<!-- fact:blockBehaviors.names -->51<!-- /fact --> names, <!-- fact:blockBehaviors.families -->50<!-- /fact --> of them with palette blocks, <!-- fact:blockBehaviors.blocks -->1480<!-- /fact --> blocks. The count is how many palette blocks the family rule in
`@jsprismarine/blocks` sends to it, which matches `vanilla_overlay/report.json`. `registry.test.ts`
fails when a name in `BLOCK_BEHAVIOR_NAMES` has no behavior, so the table cannot go stale.

The entity runtime runs `onStepOn` on each block a body's box moves into, as Java's
`Entity.checkInsideBlocks` calls `entityInside`, so pressure plates, detector rails and portals
learn what is in them. A full block an entity stands on top of, such as magma, is not in its box
and is not told.

Every family also places: a block with a `pillar_axis` state lies along the axis of the face it was
placed against before its family's own `onPlace` runs, as Java's `RotatedPillarBlock` does, so
basalt, deepslate, bone blocks, chains and froglights turn like logs whatever family they are in.

| Family | Blocks | Hooks | What it does |
| --- | --- | --- | --- |
| `plain_block` | <!-- fact:blockBehaviors.blocks.plain_block -->197<!-- /fact --> | onBreak | A full cube that proposes itself as a drop; the content break host applies the correct-tool rule. |
| `inert` | <!-- fact:blockBehaviors.blocks.inert -->199<!-- /fact --> | none | No hooks. The engine and editor blocks whose behavior is not a block behavior. |
| `slab` | <!-- fact:blockBehaviors.blocks.slab -->109<!-- /fact --> | onPlace, onBreak, onRandomTick, onPlayerInteract | Takes its half from where the click landed, merges with the slab it replaced into the double block, waxes and scrapes, and oxidizes when it is copper. |
| `stairs` | <!-- fact:blockBehaviors.blocks.stairs -->97<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onRandomTick, onPlayerInteract | Turns to the placer, flips upside down for a click in the upper half, recomputes minecraft:corner on placement and on every neighbor change, and oxidizes when it is copper. |
| `double_slab` | <!-- fact:blockBehaviors.blocks.double_slab -->93<!-- /fact --> | onBreak, onRandomTick, onPlayerInteract | Drops two of the slab it is made of, waxes and scrapes, and oxidizes when it is copper. |
| `copper` | <!-- fact:blockBehaviors.blocks.copper -->75<!-- /fact --> | onBreak, onRandomTick, onPlayerInteract, onRedstoneUpdate | Waxes with honeycomb, scrapes with an axe, and oxidizes a stage per random tick at the isolated-block rate. |
| `bamboo` | <!-- fact:blockBehaviors.blocks.bamboo -->54<!-- /fact --> | onBreak, onNeighborChanged, onRandomTick, onTick | Grows a stalk upward to its height limit, takes every block above with it when it breaks, and kills coral that is not in water. |
| `log` | <!-- fact:blockBehaviors.blocks.log -->48<!-- /fact --> | onBreak | Drops itself; its pillar_axis comes from the face it was placed against, as every pillar block takes it. |
| `utility` | <!-- fact:blockBehaviors.blocks.utility -->47<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onTick, onStepOn, onEntityFallOn | Counts a beacon pyramid, falls when it is an anvil, runs the spawner timer, and hurts an entity standing on magma. The screens the workstations open belong to the item runtime. |
| `flora` | <!-- fact:blockBehaviors.blocks.flora -->49<!-- /fact --> | onBreak, onNeighborChanged, onStepOn | Pops without soil below, keeps the two halves of a tall plant together, and marks an entity that walks into a wither rose. The effect itself is the entity runtime. |
| `sign` | <!-- fact:blockBehaviors.blocks.sign -->39<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onPlayerInteract | Keeps the sign text in a block entity, seals it against edits when honeycomb waxes it, and pops a wall sign whose backing block goes. |
| `soil` | <!-- fact:blockBehaviors.blocks.soil -->39<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onRandomTick, onTick, onEntityFallOn | Falls when it is sand, gravel or a suspicious block, keeps farmland moisture from nearby water, turns farmland back to dirt when something lands on it, spreads grass onto dirt, and turns grass or mycelium to dirt under a dark cover that blocks light. |
| `concrete_powder` | <!-- fact:blockBehaviors.blocks.concrete_powder -->16<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onTick | Falls when nothing holds it up, and turns into concrete of its color when water touches any side but below, or when it falls into water. |
| `glass` | <!-- fact:blockBehaviors.blocks.glass -->35<!-- /fact --> | onBreak | Drops itself to a silk touch tool and shatters into nothing otherwise. |
| `candle` | <!-- fact:blockBehaviors.blocks.candle -->34<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onPlayerInteract | Stacks up to four candles in one block, lights to flint and steel, snuffs to a bare hand, and goes out when water reaches it. |
| `wall` | <!-- fact:blockBehaviors.blocks.wall -->32<!-- /fact --> | onPlace, onBreak, onNeighborChanged | Recomputes the four wall_connection_type states and wall_post_bit from its neighbors and what sits on it. |
| `redstone` | <!-- fact:blockBehaviors.blocks.redstone -->32<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onTick, onPlayerInteract, onRedstoneUpdate, onBlockStateChange | Branches by name over the 31 redstone blocks: initializes wire and diode state, handles piston placement and movement, schedules repeater and comparator delays, pulses the observer, updates lit and unlit pairs and triggered containers, and primes TNT with flint and steel. |
| `container` | <!-- fact:blockBehaviors.blocks.container -->22<!-- /fact --> | onPlace, onBreak, onPlayerInteract | Gives a container its block entity, pairs a chest with a same-facing chest to its side or, for a sneaking placer, only with the chest clicked, spills its contents on break unless it is a shulker box, and marks a barrel open while a player uses it. |
| `door` | <!-- fact:blockBehaviors.blocks.door -->22<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onRandomTick, onPlayerInteract, onRedstoneUpdate | Places the upper half, picks the hinge from its neighbors, toggles both halves on interact unless it is iron or the player sneaks with an item, lets sneaking wax or scrape copper doors, follows redstone, and breaks with its other half. |
| `trapdoor` | <!-- fact:blockBehaviors.blocks.trapdoor -->22<!-- /fact --> | onBreak, onRandomTick, onPlayerInteract, onRedstoneUpdate | Toggles open_bit on interact unless it is iron or the player sneaks with an item, lets sneaking wax or scrape copper trapdoors, follows redstone, and oxidizes when it is copper. |
| `ore` | <!-- fact:blockBehaviors.blocks.ore -->20<!-- /fact --> | onBreak | Drops the ore item and its experience; an unlisted ore drops itself. |
| `pressure_plate` | <!-- fact:blockBehaviors.blocks.pressure_plate -->17<!-- /fact --> | onPlace, onNeighborChanged, onTick, onStepOn | Checks support on placement and puts out redstone_signal while something stands on it, with the weighted plates counting entities, and releases on a scheduled tick. |
| `button` | <!-- fact:blockBehaviors.blocks.button -->15<!-- /fact --> | onPlace, onNeighborChanged, onTick, onPlayerInteract | Checks support on placement, presses on interact, powers for 30 ticks on wood and 20 on stone, then releases on the scheduled tick. |
| `fence` | <!-- fact:blockBehaviors.blocks.fence -->15<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onRandomTick, onPlayerInteract | Recomputes the four minecraft:connection states, and waxes, scrapes and oxidizes when it is copper. Iron bars follow the pane rule, which refuses fences. |
| `crop` | <!-- fact:blockBehaviors.blocks.crop -->15<!-- /fact --> | onBreak, onNeighborChanged, onRandomTick, onPlayerInteract | Advances growth on a random tick at a chance the farmland moisture sets, pops off anything but farmland, and harvests the berry blocks on interact. |
| `leaves` | <!-- fact:blockBehaviors.blocks.leaves -->14<!-- /fact --> | onBreak, onRandomTick | Decays on a random tick when no log is within six blocks through other leaves, unless persistent_bit is set, drops a sapling by chance, and drops itself to shears or silk touch. |
| `fence_gate` | <!-- fact:blockBehaviors.blocks.fence_gate -->13<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onPlayerInteract, onRedstoneUpdate | Toggles open_bit on interact and on redstone, and sets in_wall_bit when a wall sits on either side. |
| `climbing` | <!-- fact:blockBehaviors.blocks.climbing -->11<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onTick | Pops without the face it hangs on, gives scaffolding its stability distance from the supported block, and holds a vine or a lichen back from anything but shears. |
| `sapling` | <!-- fact:blockBehaviors.blocks.sapling -->11<!-- /fact --> | onBreak, onNeighborChanged, onRandomTick | Advances age_bit on a random tick and grows a tree on the next one. The tree shape is provisional until the feature runtime owns it. |
| `furnace` | <!-- fact:blockBehaviors.blocks.furnace -->9<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onPlayerInteract, onStepOn | Gives the block its slots, faces the placer, drops its contents on break, extinguishes a campfire that water reaches, and relights one with flint and steel. |
| `dripstone` | <!-- fact:blockBehaviors.blocks.dripstone -->9<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onRandomTick, onTick, beforeOnPlayerPlace | Points placed dripstone and sulfur spikes away from where the placer looks, joins them into columns, drops a stalactite that lost its support and pops a stalagmite or an amethyst bud without the block it grows from, grows an amethyst bud on a free face of a budding block, advances a bud a stage, and drops shards from a cluster. |
| `head` | <!-- fact:blockBehaviors.blocks.head -->7<!-- /fact --> | onPlace, onBreak, onNeighborChanged | Turns a standing head toward its placer in its block entity's rotation, keeps its profile there, and pops when the block it sits on goes. |
| `portal` | <!-- fact:blockBehaviors.blocks.portal -->6<!-- /fact --> | onPlace, onNeighborChanged, onRandomTick, onTick, onPlayerInteract, onStepOn | Lights a nether portal when fire appears inside a frame, collapses it when a frame block goes, fills a complete end portal ring, rolls the zombified piglin spawn, counts an entity down to a trip, and ages fire out. The end gateway is claimed here for a later teleport and has no hook yet. Travel is the server's. |
| `chemistry` | <!-- fact:blockBehaviors.blocks.chemistry -->5<!-- /fact --> | none | No hooks. The chemistry workbenches open Education Edition screens a vanilla server does not implement. |
| `ice` | <!-- fact:blockBehaviors.blocks.ice -->5<!-- /fact --> | onBreak, onRandomTick | Melts to water on a random tick above light 12, frosted ice ages through its four stages first, and a silk touch tool takes the block itself instead of leaving water. |
| `liquid` | <!-- fact:blockBehaviors.blocks.liquid -->5<!-- /fact --> | onPlace, onNeighborChanged, onTick, onStepOn | Spreads on a scheduled tick at the rate its dimension sets, turns to rock where water meets lava, and shows the flame of what stands in lava. A bucket or a bottle that fills from a source is the item's behavior in `@jsprismarine/item-behaviors`. A bubble column drags down over magma, pushes up over soul sand, and turns back into water over anything else. |
| `rail` | <!-- fact:blockBehaviors.blocks.rail -->4<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onTick, onStepOn, onRedstoneUpdate | Pops without a block below, sets rail_data_bit on the powered rails from the signal reaching them, and on a detector rail while a minecart is on it. |
| `sculk` | <!-- fact:blockBehaviors.blocks.sculk -->4<!-- /fact --> | onBreak, onNeighborChanged, onTick, onStepOn | Pops a sculk vein once no face it covers is held, runs the shrieker warning, cycles the sensor through its three phases, and gives experience for breaking sculk. The catalyst needs a mob death, which no block hook reports. |
| `command_block` | <!-- fact:blockBehaviors.blocks.command_block -->3<!-- /fact --> | onPlace, onTick, onRedstoneUpdate | Runs an impulse block on the rising edge of power, a repeating block every tick while powered or always active, and the chain blocks in front of a block that ran, after Java's `CommandBlock`, with Bedrock's tick delay. A conditional block runs only when the block behind it succeeded. The command runs through the host's `runCommand`. |
| `torch` | <!-- fact:blockBehaviors.blocks.torch -->3<!-- /fact --> | onBreak, onNeighborChanged | Reads torch_facing_direction to find the face it stands on and pops when that face stops holding it. |
| `dripleaf` | <!-- fact:blockBehaviors.blocks.dripleaf -->3<!-- /fact --> | onNeighborChanged, onTick, onStepOn | Tilts a big dripleaf a stage per scheduled tick while an entity stands on it, then drops it and resets. |
| `egg` | <!-- fact:blockBehaviors.blocks.egg -->3<!-- /fact --> | onRandomTick, onEntityFallOn | Cracks through cracked_state on a random tick and hatches the entity when it is fully cracked. |
| `lantern` | <!-- fact:blockBehaviors.blocks.lantern -->11<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onRandomTick, onPlayerInteract, beforeOnPlayerPlace | Hangs when the placer looks up and a block above holds it, checks the block above when it hangs and the one below when it stands, and waxes, scrapes and oxidizes when it is copper. |
| `snow` | <!-- fact:blockBehaviors.blocks.snow -->3<!-- /fact --> | onBreak, onNeighborChanged, onRandomTick | Melts on a random tick above light 12, drops one snowball per layer, and pops without support. |
| `banner` | <!-- fact:blockBehaviors.blocks.banner -->2<!-- /fact --> | onPlace, onBreak, onNeighborChanged | Keeps the base color and patterns in a block entity and pops when its support goes. |
| `bed` | <!-- fact:blockBehaviors.blocks.bed -->2<!-- /fact --> | onPlace, onBreak, onNeighborChanged, onPlayerInteract | Places the head half, marks occupied_bit while a player sleeps, breaks when the half the way it faces is gone, and explodes in the nether and the end. |
| `cake` | <!-- fact:blockBehaviors.blocks.cake -->1<!-- /fact --> | onNeighborChanged, onPlayerInteract | Takes a bite per use through bite_counter and disappears after the seventh. |
| `cauldron` | <!-- fact:blockBehaviors.blocks.cauldron -->1<!-- /fact --> | onBreak, onPlayerInteract | Takes a whole bucket or two levels from a bottle, gives back the emptied or filled container, and refuses a bottle against lava or powder snow. |
| `composter` | <!-- fact:blockBehaviors.blocks.composter -->1<!-- /fact --> | onPlayerInteract | Adds a layer per use and gives back bone meal at the eighth, which is the level Java calls full. |
| `flower_pot` | <!-- fact:blockBehaviors.blocks.flower_pot -->1<!-- /fact --> | onBreak, onPlayerInteract | Swaps the plant it holds on use and drops it on break; which plants fit is the item runtime decision. |
| `pane` | <!-- fact:blockBehaviors.blocks.pane -->0<!-- /fact --> | onPlace, onNeighborChanged | The pane connection rule, which joins panes, bars, walls and solid blocks but not fences. |

`pane` is the one family with no vanilla block. The identifier rules send every `_pane` to `glass`
and `iron_bars` to `fence` before the pane rule is reached, so the rule matches nothing. It stays
registered because the rule exists in `@jsprismarine/blocks` and a pack can name it, and because the
pane connection rule is what a custom thin block wants.

## What is deliberately partial

The remaining limits need a world event or data this package does not own, or behavior from another
runtime.

- **Family drops are fallbacks.** An active `minecraft:loot` component selects a behavior-pack
  table, and mapped blocks without one use Java's table. Family-supplied drops remain for blocks
  without either table and for hosts with no content runtime; ore experience remains a separate
  block effect because loot tables do not carry it.

The rest are scoped to this phase:

- **Tree growth.** A sapling grows a trunk with a two-layer canopy, not the species feature. The
  real trees belong to the feature runtime; this is enough for the sapling's own rule to be
  observable, and it is the one provisional piece of the package.
- **The sculk catalyst.** Its charge comes from a mob death within eight blocks, and no block hook
  reports a death. The shrieker and the sensor are implemented.
- **Portal travel.** The geometry is here (below), but which world is "the Nether", the 8:1
  coordinate link, the destination search and the client's dimension change belong to the server,
  which owns the dimension list. `@jsprismarine/prismarine`'s `DimensionTravel` is that half;
  [docs/data-driven/dimensions.md](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/data-driven/dimensions.md) describes the whole trip.
  The end gateway is claimed by the `portal` family and has no hook, so it teleports nobody.
- **Redstone wire topology.** A wire fades one step per block from its neighbors. Stepping up and
  down over blocks, and the strong and weak distinction a solid block makes, need the solidity
  column the overlay is still missing.
- **Workstation screens.** The crafting table, the loom, the smithing table, the enchanting table
  and the anvil open a screen. The block side is here; the screens are the item runtime's.
- **Bed and bamboo pairing.** A bed finds its other half from the facing it was placed with, which
  no state carries afterwards, so a neighbor change falls back to the support check.
- **Education chemistry.** Five blocks with no hooks, on purpose. A vanilla server does not run
  Education Edition screens.
