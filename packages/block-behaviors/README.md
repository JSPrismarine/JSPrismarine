# @jsprismarine/block-behaviors

What a block does. `@jsprismarine/blocks` says what a block is: its components, its states and its
place in the palette. Every component factory there returns `{}`, so all 1477 vanilla blocks resolve
with no behavior at all until this package registers one.

A behavior is a named set of handlers over `BlockHooks`, attached by family rather than by block, so
49 families cover the whole palette. One call wires them up:

```typescript
import { BehaviorRegistry } from '@jsprismarine/content';
import { type BlockHooks, resolveBlocks } from '@jsprismarine/blocks';
import { registerVanillaBlockBehaviors } from '@jsprismarine/block-behaviors';

const behaviors = new BehaviorRegistry<BlockHooks>();
registerVanillaBlockBehaviors(behaviors, world);

resolveBlocks(definitions.blocks.values(), { behaviors });
```

`world` is the second argument because a handler has to reach the world and no hook event carries
one. It is a `BlockWorld`, described below.

## The world interface

`WorldActions` is everything a block does to the world, and the whole of what a family may use:

| Group | Methods |
| --- | --- |
| Blocks | `getBlock`, `setBlock`, `propertiesOf`, `lightDampeningOf` |
| Items and entities | `dropItem`, `destroyBlock`, `spawnEntity`, `removeEntity`, `entitiesAt` |
| Effects | `playSound`, `spawnParticle` |
| Scheduling | `scheduleTick` |
| Block entities | `getBlockData`, `setBlockData` |
| Updates | `notifyNeighbors`, `redstonePower`, `lightLevel` |
| Chance | `random` |

Four of those are there for reasons worth stating. `propertiesOf` returns another block's
`jsprismarine:block_properties`, which is how the piston and the falling blocks read `push_reaction`
instead of carrying a list. `random` is on the interface rather than inside the families so a test
drives a probabilistic rule to either outcome without patching a global. `destroyBlock` is how a
family takes a block out that it is not itself: the host raises the block's `onBreak` and rolls
Java's loot table for it, where this package would otherwise have to guess that the block drops one
of itself. It is optional, and a host that leaves it out gets that guess, which is what the test
voxel world does. `popBlock` is the one rule that uses it, and the piston's popped block, a block
that lost its support and a block a falling anvil cleared out of the way all go through it.

`lightDampeningOf` can read a block state's vanilla `minecraft:light_dampening` value, so rules can
check how much light a cover blocks without treating every support block as opaque. When a host
cannot report dampening, the shared rule treats it as unknown and does not convert the ground block.

A `BlockWorld` is a set of dimensions, and `at(dimension)` returns the `WorldActions` for one. Each
handler receives the actions for its own event's dimension already resolved, so the dimension never
appears in a family's code. A server with one world passes `singleDimensionWorld(actions)`.

Nothing here names a server class. The events are structural, the world is an interface, and the
package depends only on `@jsprismarine/blocks` and `@jsprismarine/content`.

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
| Honeycomb waxes copper, an axe scrapes it | `copper`, `slab`, `double_slab`, `stairs`, `fence`, `lantern` |
| Honeycomb seals a sign against edits | `sign` |
| Silk touch takes glass and ice whole | `glass`, `ice` |
| Shears or silk touch take leaves, vines and lichens whole | `leaves`, `climbing` |
| A bucket or a bottle fills and empties | `cauldron`, `liquid` |
| Flint and steel lights it | `candle`, `furnace` (the campfire), `redstone` (TNT) |
| The clicked face gives a pillar its axis | `log` |
| The click position gives a slab its half and a stair its flip | `slab`, `stairs` |

`rules/heldItem.ts` owns the item questions and `rules/placement.ts` the placement ones, so an item
name or an enchantment id is written down once. Neither imports `@jsprismarine/items`: a `HookItem`
is whatever the server hands the hook, and that package's `ItemStack` satisfies the interface
structurally.

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

## Values come from the block

Where a behavior needs a number, it reads it off the block rather than carrying its own copy.
`jsprismarine:block_properties` is the source for `push_reaction` (the piston and the falling
blocks), `requires_correct_tool` (the drop rule) and `random_tick`. Reading it goes through the
component factory in `@jsprismarine/blocks`, so an absent component reads as that schema's defaults
and a malformed one does too rather than failing the load. `friction` is published for the movement
code and no family reads it, because friction is a decision the entity makes, not the block.

The state names are the palette's. `geometry.test.ts` checks `CARDINAL_DIRECTIONS` against the
captured palette's `minecraft:cardinal_direction` domain, and `rules/weathering.test.ts` walks every
copper block in the palette and asserts that each name the three transitions produce is a block that
exists.

## The families

49 names, 1477 blocks. The count is how many palette blocks the family rule in
`@jsprismarine/blocks` sends to it, which matches `vanilla_overlay/report.json`. `registry.test.ts`
fails when a name in `BLOCK_BEHAVIOR_NAMES` has no behavior, so the table cannot go stale.

| Family | Blocks | Hooks | What it does |
| --- | --- | --- | --- |
| `plain_block` | 218 | onBreak | A full cube that drops itself, unless its properties say a tool decides. |
| `inert` | 203 | none | No hooks. The engine and editor blocks whose behavior is not a block behavior. |
| `slab` | 109 | onPlace, onBreak, onRandomTick, onPlayerInteract | Takes its half from where the click landed, merges with the slab it replaced into the double block, waxes and scrapes, and oxidizes when it is copper. |
| `stairs` | 97 | onPlace, onBreak, onNeighborChanged, onRandomTick, onPlayerInteract | Turns to the placer, flips upside down for a click in the upper half, recomputes minecraft:corner on placement and on every neighbor change, and oxidizes when it is copper. |
| `double_slab` | 93 | onBreak, onRandomTick, onPlayerInteract | Drops two of the slab it is made of, waxes and scrapes, and oxidizes when it is copper. |
| `copper` | 84 | onBreak, onRandomTick, onPlayerInteract, onRedstoneUpdate | Waxes with honeycomb, scrapes with an axe, and oxidizes a stage per random tick at the isolated-block rate. |
| `bamboo` | 52 | onBreak, onNeighborChanged, onRandomTick, onTick | Grows a stalk upward to its height limit, takes every block above with it when it breaks, and kills coral that is not in water. |
| `log` | 48 | onPlace, onBreak | Takes pillar_axis from the face the placement was made against, falling back to the placer, and drops itself. |
| `utility` | 47 | onPlace, onBreak, onNeighborChanged, onTick, onStepOn, onEntityFallOn | Counts a beacon pyramid, falls when it is an anvil, runs the spawner timer, and hurts an entity standing on magma. The screens the workstations open belong to the item runtime. |
| `flora` | 46 | onBreak, onNeighborChanged, onStepOn | Pops without soil below, keeps the two halves of a tall plant together, and marks an entity that walks into a wither rose. The effect itself is the entity runtime. |
| `sign` | 39 | onPlace, onBreak, onNeighborChanged, onPlayerInteract | Keeps the sign text in a block entity, seals it against edits when honeycomb waxes it, and pops a wall sign whose backing block goes. |
| `soil` | 39 | onPlace, onBreak, onNeighborChanged, onRandomTick, onTick, onEntityFallOn | Falls when it is sand, gravel or a suspicious block, keeps farmland moisture from nearby water, turns farmland back to dirt when something lands on it, spreads grass onto dirt, and turns grass or mycelium to dirt under a dark cover that blocks light. |
| `glass` | 35 | onBreak | Drops itself to a silk touch tool and shatters into nothing otherwise. |
| `candle` | 34 | onPlace, onBreak, onNeighborChanged, onPlayerInteract | Stacks up to four candles in one block, lights to flint and steel, snuffs to a bare hand, and goes out when water reaches it. |
| `wall` | 32 | onPlace, onBreak, onNeighborChanged | Recomputes the four wall_connection_type states and wall_post_bit from its neighbors and what sits on it. |
| `redstone` | 31 | onBreak, onNeighborChanged, onTick, onPlayerInteract, onRedstoneUpdate, onBlockStateChange | Branches by name over the 31 redstone blocks: wire fading, repeater and comparator delays, the observer pulse, piston push and pull, the lit and unlit block pairs, the triggered containers, and priming TNT with flint and steel. |
| `container` | 22 | onPlace, onBreak, onPlayerInteract | Gives a container its block entity, pairs a chest with the chest beside it, spills its contents on break unless it is a shulker box, and marks a barrel open while a player uses it. |
| `door` | 22 | onPlace, onBreak, onNeighborChanged, onRandomTick, onPlayerInteract, onRedstoneUpdate | Places the upper half, picks the hinge from its neighbors, toggles both halves on interact unless it is iron, follows redstone, and breaks with its other half. |
| `trapdoor` | 22 | onBreak, onRandomTick, onPlayerInteract, onRedstoneUpdate | Toggles open_bit on interact unless it is iron, follows redstone, and oxidizes when it is copper. |
| `ore` | 20 | onBreak | Drops the ore item and its experience; an unlisted ore drops itself. |
| `pressure_plate` | 17 | onNeighborChanged, onTick, onStepOn | Puts out redstone_signal while something stands on it, with the weighted plates counting entities, and releases on a scheduled tick. |
| `button` | 15 | onNeighborChanged, onTick, onPlayerInteract | Presses on interact, powers for 30 ticks on wood and 20 on stone, then releases on the scheduled tick. |
| `fence` | 15 | onPlace, onBreak, onNeighborChanged, onRandomTick, onPlayerInteract | Recomputes the four minecraft:connection states, and waxes, scrapes and oxidizes when it is copper. Iron bars follow the pane rule, which refuses fences. |
| `crop` | 14 | onBreak, onNeighborChanged, onRandomTick, onPlayerInteract | Advances growth on a random tick at a chance the farmland moisture sets, pops off anything but farmland, and harvests the berry blocks on interact. |
| `leaves` | 14 | onBreak, onRandomTick | Decays on a random tick when no log is within six blocks through other leaves, unless persistent_bit is set, drops a sapling by chance, and drops itself to shears or silk touch. |
| `fence_gate` | 13 | onPlace, onBreak, onNeighborChanged, onPlayerInteract, onRedstoneUpdate | Toggles open_bit on interact and on redstone, and sets in_wall_bit when a wall sits on either side. |
| `climbing` | 11 | onPlace, onBreak, onNeighborChanged, onTick | Pops without the face it hangs on, gives scaffolding its stability distance from the supported block, and holds a vine or a lichen back from anything but shears. |
| `sapling` | 11 | onBreak, onNeighborChanged, onRandomTick | Advances age_bit on a random tick and grows a tree on the next one. The tree shape is provisional until the feature runtime owns it. |
| `furnace` | 9 | onPlace, onBreak, onNeighborChanged, onPlayerInteract, onStepOn | Gives the block its slots, faces the placer, drops its contents on break, extinguishes a campfire that water reaches, and relights one with flint and steel. |
| `dripstone` | 8 | onBreak, onNeighborChanged, onRandomTick | Grows an amethyst bud on a free face of a budding block, advances a bud a stage, and drops shards from a cluster. |
| `head` | 7 | onPlace, onBreak, onNeighborChanged | Keeps its rotation and profile in a block entity and pops when the block it sits on goes. |
| `chemistry` | 5 | none | No hooks. The chemistry workbenches open Education Edition screens a vanilla server does not implement. |
| `portal` | 5 | onNeighborChanged, onTick, onPlayerInteract, onStepOn | Counts an entity down to a nether portal trip, ages fire out, and fills an end portal frame. The destination search across dimensions is left to the server, which owns the dimension list. |
| `ice` | 4 | onBreak, onRandomTick | Melts to water on a random tick above light 12, frosted ice ages through its four stages first, and a silk touch tool takes the block itself instead of leaving water. |
| `liquid` | 4 | onPlace, onNeighborChanged, onRandomTick, onTick, onPlayerInteract, onStepOn | Spreads on a scheduled tick at the rate its dimension sets, turns to rock where water meets lava, burns what stands in lava, and gives a source block up to a bucket or a bottle. |
| `rail` | 4 | onPlace, onBreak, onNeighborChanged, onRedstoneUpdate | Pops without a block below, and sets rail_data_bit on the powered rails from the signal reaching them. |
| `sculk` | 4 | onBreak, onTick, onStepOn | Runs the shrieker warning, cycles the sensor through its three phases, and gives experience for breaking sculk. The catalyst needs a mob death, which no block hook reports. |
| `torch` | 4 | onBreak, onNeighborChanged | Reads torch_facing_direction to find the face it stands on and pops when that face stops holding it. |
| `dripleaf` | 3 | onNeighborChanged, onTick, onStepOn | Tilts a big dripleaf a stage per scheduled tick while an entity stands on it, then drops it and resets. |
| `egg` | 3 | onRandomTick, onEntityFallOn | Cracks through cracked_state on a random tick and hatches the entity when it is fully cracked. |
| `lantern` | 3 | onBreak, onNeighborChanged, onRandomTick, onPlayerInteract | Checks the block above when it hangs and the one below when it stands, and waxes, scrapes and oxidizes when it is copper. |
| `snow` | 3 | onBreak, onNeighborChanged, onRandomTick | Melts on a random tick above light 12, drops one snowball per layer, and pops without support. |
| `banner` | 2 | onPlace, onBreak, onNeighborChanged | Keeps the base color and patterns in a block entity and pops when its support goes. |
| `bed` | 2 | onPlace, onBreak, onNeighborChanged, onPlayerInteract | Places the head half, marks occupied_bit while a player sleeps, breaks with its other half, and explodes in the nether and the end. |
| `cake` | 1 | onNeighborChanged, onPlayerInteract | Takes a bite per use through bite_counter and disappears after the seventh. |
| `cauldron` | 1 | onBreak, onPlayerInteract | Takes a whole bucket or two levels from a bottle, gives back the emptied or filled container, and refuses a bottle against lava or powder snow. |
| `composter` | 1 | onPlayerInteract | Adds a layer per use and gives back bone meal at the eighth, which is the level Java calls full. |
| `flower_pot` | 1 | onBreak, onPlayerInteract | Swaps the plant it holds on use and drops it on break; which plants fit is the item runtime decision. |
| `pane` | 0 | onPlace, onNeighborChanged | The pane connection rule, which joins panes, bars, walls and solid blocks but not fences. |

`pane` is the one family with no vanilla block. The identifier rules send every `_pane` to `glass`
and `iron_bars` to `fence` before the pane rule is reached, so the rule matches nothing. It stays
registered because the rule exists in `@jsprismarine/blocks` and a pack can name it, and because the
pane connection rule is what a custom thin block wants.

## What is deliberately partial

The first two are limits of the hook interface rather than unfinished work. They are listed first
because they bound what any block behavior package can do.

- **A block that requires the correct tool drops nothing here.** The event now carries the item, but
  deciding whether that item is the right tool needs the per-item mining tiers, which live in
  `@jsprismarine/items`. `requires_correct_tool` is still honored by refusing the drop, and the
  server's tool check owns the other half.
- **No hook says whether the player was sneaking.** Vanilla runs the block's own use before the
  item's, so an axe on a copper door opens it and only a sneaking player scrapes it. Without the
  sneak flag the door and the trapdoor always open, and their copper variants cannot be waxed or
  scraped through the hook. Every other copper family can, because nothing else claims the
  interaction first.
- **Drops are a stopgap.** The ore table, the leaf sapling chance and the snow layer count are
  written here so a break produces the right item today. Java's 1447 loot tables arrive with the
  loot package and should replace all of it.

The rest are scoped to this phase:

- **Tree growth.** A sapling grows a trunk with a two-layer canopy, not the species feature. The
  real trees belong to the feature runtime; this is enough for the sapling's own rule to be
  observable, and it is the one provisional piece of the package.
- **The sculk catalyst.** Its charge comes from a mob death within eight blocks, and no block hook
  reports a death. The shrieker and the sensor are implemented.
- **Portals.** The nether portal counts an entity down and the end portal frame takes an eye, but
  the destination search and the 8:1 coordinate link need the dimension list, which the server owns.
- **Fire spread.** Fire ages out and goes out without support. Spreading to flammable neighbors
  needs each block's flame and burn odds, which the overlay does not publish yet.
- **Redstone wire topology.** A wire fades one step per block from its neighbors. Stepping up and
  down over blocks, and the strong and weak distinction a solid block makes, need the solidity
  column the overlay is still missing.
- **Workstation screens.** The crafting table, the loom, the smithing table, the enchanting table
  and the anvil open a screen. The block side is here; the screens are the item runtime's.
- **Bed and bamboo pairing.** A bed finds its other half from the facing it was placed with, which
  no state carries afterwards, so a neighbor change falls back to the support check.
- **Education chemistry.** Five blocks with no hooks, on purpose. A vanilla server does not run
  Education Edition screens.
