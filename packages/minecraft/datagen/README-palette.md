# Capturing the block palette

`snapshot/v<protocol>/block-palette.json` describes which properties each Bedrock block has and
which values each property accepts. It is captured from a Bedrock Dedicated Server by the same
job that captures the rest of the Bedrock data:

```sh
pnpm --filter @jsprismarine/bedrock-data run dump:bedrock -- --pass palette
pnpm --filter @jsprismarine/minecraft run generate:blocks
```

The capture needs the pinned server unpacked in the fetch cache, which
`pnpm --filter @jsprismarine/bedrock-data run fetch:sources` puts there, and it only runs on
Linux x86-64, because that is the only build `sources.json` pins. Add `--protocol <n>` to both
commands to capture a version other than the manifest's default; that version has to be
declared in [`manifest.json`](manifest.json) first, since the merge finds its output directory
by the Minecraft version and refuses one it does not recognize.

Expect it to take a while. The server boots twice, and the first run places every block type in
the game.

## Why it takes two server runs

Neither half of the answer is available on its own, so the capture asks two different sources
and joins them.

The wire carries nothing to read. Runtime block ids are hashes of a block's name and its states,
so the server never sends a palette at all: `StartGamePacket` lists only the blocks a server
added itself, and for vanilla that list is empty.

The Script API knows too much. `BlockTypes` and `BlockPermutation` answer for the game's
*internal* blocks, where a flattened name still carries its legacy states, so
`minecraft:purple_wool` comes back with a `color`. Taken whole that implies 56957 states against
the 17487 the network has, and every extra one hashes to a runtime id no client recognizes. The
extras cannot be filtered out by name either, because `minecraft:cardinal_direction` is legacy
on a door and genuine on a shelf.

A saved world, though, has exactly the right thing: a sub-chunk stores its palette as NBT, each
entry a name and the states that go with it, in the form the network uses.

So **which properties** a block has comes from a saved world, and **which values** each property
takes comes from the game, asked block by block. The second question has to be asked per block
rather than per property, because a property's declaration is game-wide: `age` is declared
`0..15`, and cocoa takes `0..2`.

## What the pass does

Both runs use `palette-pack/`, whose two entry scripts are the two halves of the capture.
`packages/bedrock-data/utils/bedrock-dump/pack.ts` writes the pack manifest for whichever half
it is staging and enables the pack for a fresh world, so neither the manifest nor
`world_behavior_packs.json` is ever edited by hand.

1. **`scripts/place.js`** puts one of every block type into the world, then the job stops the
   server cleanly so the save is written. Every block is placed four times, in four settings:
   on stone under a roof, on farmland, directly under a roof, and beside a wall. A block placed
   where it cannot stand pops before the save and is then simply missing from the catalog;
   seventeen went missing that way once and seven another time, and which ones depended on the
   tick order. With the four settings, 1.26.51 captured all 1477 of its block types. The
   `PALETTE PLACED ok=… types=…` line the job echoes counts placements and types.

2. **`extract-block-palette.mjs`** reads the palettes back out of the save. The number of
   distinct names it finds should equal `types=` from the first run. If it is short, some blocks
   popped, and the settings in `place.js` want another look.

3. **`scripts/domains.js`** runs against a second fresh world and logs one `PALETTE BLOCK` line
   per block type: every property the game knows for that block, and the values it accepts.

4. **`merge-block-palette.mjs`** joins the two halves into the snapshot. It refuses a block the
   world saved that the game did not describe, and a network property the game has no values
   for. It warns about a block the game describes that the world never saved, which means the
   first run lost one.

If you need to run a step by hand — to debug a short catalog, say — each script takes its inputs
on the command line, and `--pass place` and `--pass domains` are not separately selectable;
`--pass palette` runs the sequence.

## Checking a new capture

A disagreement here does not fail a build. It produces runtime ids that a client quietly
ignores, so compare a new capture against the previous one and account for every difference.

The capture that replaced the third-party dump was checked against it. Of the 1218 blocks in
both, 1186 had identical property sets, and the other 32 differed by one real rename:
`direction` became `minecraft:cardinal_direction`. No property's set of values disagreed. What
was left over was 161 blocks new since 1.21.40, and `minecraft:chain`, which 1.26.40 renamed to
`minecraft:iron_chain`.

The 1.26.51 capture was checked against the 1.26.40 one the same way: 98 new blocks, the wool
and concrete stairs and slabs, and 123 with a changed property set. Every one of those was
something the release notes announced — `minecraft:corner` on 65 stairs, and the four
`minecraft:connection_*` states on 58 fences, panes, bars and trip wires. Again no value set
disagreed.
