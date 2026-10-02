# Capturing the block palette

`snapshot/block-palette.json` is captured from a Bedrock Dedicated Server. This is how, and why
it takes two passes rather than one.

## Why two passes

Neither source alone is the answer.

- **The wire has nothing.** Runtime block ids are hashes of a block's name and states, so the
  server never sends a palette: `StartGamePacket` carries only the blocks a server has added
  itself, and for vanilla that list is empty.
- **The Script API knows too much.** `BlockTypes` and `BlockPermutation` report the game's
  *internal* blocks, where a flattened name still answers for its legacy states -
  `minecraft:purple_wool` comes back carrying a `color`. Taken whole it implies 56957 states
  against the 17487 the network has, and every extra one hashes to a runtime id no client
  recognises. Nor can the extras be filtered by name: `minecraft:cardinal_direction` is legacy
  on a door and genuine on a shelf.
- **A saved world has exactly the right thing.** A sub chunk stores its palette as NBT - each
  entry a name and the states that go with it - in the form the network uses.

So: **which properties** a block has comes from a saved world, and **which values** each takes
comes from the game, asked block by block. The second half has to be asked per block rather than
per property, because a property's declaration is game wide: `age` is declared `0..15` and cocoa
takes `0..2`.

## Doing it

Unpack a Bedrock Dedicated Server of the version you want. Then:

1. Copy `palette-pack/` into the server's `development_behavior_packs/`, and enable it for the
   world by writing its uuid into `worlds/<level>/world_behavior_packs.json`:

   ```json
   [{ "pack_id": "1f8c2a10-5b3e-4d21-9c47-8e0a2b6d4f11", "version": [1, 0, 0] }]
   ```

   The pack has two entry points. Point `manifest.json` at `scripts/place.js` for the first pass
   and `scripts/domains.js` for the second.

2. **First pass, `scripts/place.js`.** Start the server, wait for `PALETTE PLACED ok=…` in the
   log, then stop it *cleanly* - type `stop`, do not kill it, or the world is never written.

   Every block is placed four times, in four settings - on stone under a roof, on farmland,
   directly under a roof, and beside a wall - because a block placed where it cannot stand pops
   before the save and is then simply missing. Seventeen went missing that way once, seven
   another time, and which ones depended on the tick order; with the four settings 1.26.51
   captured all 1477 of its block types. `PLACED ok=` counts placements, `types=` the types.

3. Read the palettes out of the save:

   ```
   node datagen/extract-block-palette.mjs "<server>/worlds/<level>/db" states.json
   ```

   It says how many distinct names it found. That number should equal `types=` from the log; if
   it is short, the missing blocks popped, and the settings in `place.js` want another look.

4. **Second pass, `scripts/domains.js`.** Start the server again and take the `PALETTE BLOCK`
   lines out of the log; each is one block's properties and the values the game accepts for them:

   ```
   grep 'PALETTE BLOCK' bds.log | sed 's/.*PALETTE BLOCK //' > domains.jsonl
   ```

5. Merge the two into `snapshot/block-palette.json`, then generate:

   ```
   node datagen/merge-block-palette.mjs states.json domains.jsonl 1.26.51 bedrock-server-1.26.51.1
   pnpm generate:blocks
   ```

   The merge refuses a block the world saved that the game did not describe, and a network
   property the game has no values for; it warns about a block the game describes that the
   world never saved, which is step 2 having lost one.

The server needs `online-mode=false` and `allow-list=false` only if you also want to connect to
it; the capture itself needs no client. From 1.26.50 it also needs `transport=raknet` for that,
and its recipes live in `__brarchive/recipes.brarchive` rather than loose files - the recipe
generator reads either.

## Checking it

The capture that replaced the third party dump was checked against it. Of the 1218 blocks in
both: 1186 had identical property sets, and the other 32 differed by one real rename -
`direction` became `minecraft:cardinal_direction`. No property's set of values disagreed. What
was left over was 161 blocks new since 1.21.40, and `minecraft:chain`, which 1.26.40 renamed to
`minecraft:iron_chain`.

The 1.26.51 capture was checked against the 1.26.40 one the same way: 98 blocks new - the wool
and concrete stairs and slabs - and 123 with a changed property set, every one of them what the
release notes announced: `minecraft:corner` on 65 stairs, and the four `minecraft:connection_*`
states on 58 fences, panes, bars and trip wires. No value set disagreed.

Worth repeating against whatever the current catalogue is when you next capture: a silent
disagreement here does not fail a build, it produces runtime ids a client quietly ignores.
