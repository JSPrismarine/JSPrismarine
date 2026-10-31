# @jsprismarine/blocks

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`440e164`](https://github.com/JSPrismarine/JSPrismarine/commit/440e164b88f43548c9c4fe8ae896387157f21701) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose merged Java datapack tag memberships on resolved block and item types.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`ea083fb`](https://github.com/JSPrismarine/JSPrismarine/commit/ea083fb8d67d0c285724b73bf94b41947afc4013) Thanks [@filiphsps](https://github.com/filiphsps)! - Write captured fixed partial collision shapes into the vanilla block overlay.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f33a57c`](https://github.com/JSPrismarine/JSPrismarine/commit/f33a57c3750488f1ed77a441ab26b7c1086eff68) Thanks [@filiphsps](https://github.com/filiphsps)! - Include captured Bedrock display names in generated block definitions.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`57f252b`](https://github.com/JSPrismarine/JSPrismarine/commit/57f252b2781508290fac2e842cf37fb652467d66) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop the overlay generator from shaping the package's source.
  
  `src/overlay.ts` imported `./families.ts` with the extension so that
  `utils/generate-overlay.ts` could load it under plain `node`. The cost landed on consumers: every
  package that resolves `@jsprismarine/blocks` to its source had to set `allowImportingTsExtensions`
  and `rewriteRelativeImportExtensions` to typecheck, which `@jsprismarine/block-behaviors` and
  `@jsprismarine/engine-systems` both did.
  
  The generator is now `utils/generate-overlay.mjs`, plain JavaScript over the built `dist/`, and
  `generate:overlay` builds the package first. `src/overlay.ts` writes an ordinary extensionless
  import, and both flags are gone from this package's tsconfig. The generated overlay is unchanged
  byte for byte; no public API moved, so this is a `patch`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d4afedd`](https://github.com/JSPrismarine/JSPrismarine/commit/d4afeddfc1a6016173261b800813e9f248208db8) Thanks [@filiphsps](https://github.com/filiphsps)! - Emit captured state-varying collision boxes as vanilla overlay permutations.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`89a02c8`](https://github.com/JSPrismarine/JSPrismarine/commit/89a02c81dd66293ab2b303851aad61c891535081) Thanks [@filiphsps](https://github.com/filiphsps)! - Publish the per-state block geometry column no property table had. `bedrockCollisionTopOf` answers
  how high a body standing in a block's cell is held up, and `bedrockLiquidReactionOf` what a liquid
  reaching the block does to it, for all 1477 palette blocks over 22091 states.
  
  The source is a Bedrock Dedicated Server's own block table, captured in the resources submodule and
  flattened by `utils/generate-geometry.mjs` into a committed table keyed by block identifier, with
  3014 per-state overrides keyed by runtime id. Java's shapes would have been the wrong ones: a cactus
  is 0.9375 tall in Java and a full block in Bedrock, and the client decides where a player may stand.
  
  This is the column the overlay generator says it does not have, and the one physics and pathfinding
  outside the content runtime were filling with hand-written name lists.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bfb9a31`](https://github.com/JSPrismarine/JSPrismarine/commit/bfb9a31a40c8173f1b811ee63b2308f357c47fd0) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/blocks`, the Bedrock block definition grammar and component runtime over
  `@jsprismarine/content`. `parseBlockDefinition` reads `format_version`, `minecraft:block.description`
  with its identifier, menu category, states, traits and the undocumented `internal_vanilla_data`, the
  component list and the permutations, dispatching on `format_version` to the newest of three known
  schemas at or below the file's version. `createBlockComponentRegistry` holds 56 `ComponentFactory`
  entries: the 49 names in Mojang's 1.26.20 `Components.json` with the parameter defaults those
  schemas declare, the four property components renamed at 1.19.40, `minecraft:custom_components`, and
  two this project adds for the facts Bedrock's grammar cannot hold. `BlockHooks` declares the ten
  hook names Mojang's `BlockCustomComponent` uses, so the behavior families attach through
  `BehaviorRegistry` and a future script host fits the same shape. `resolveBlocks` evaluates each
  permutation's Molang condition per state and applies its components over the base list with the
  later entry winning, groups states that match the same permutations onto one resolved type, and
  hands back a `BlockType` per identifier and a `BlockState` per palette state over a dense runtime
  id. `flattenBlockStates` precomputes solidity, light emission, light filter, blast resistance,
  hardness, friction and random ticking into typed arrays indexed by that id. The package ships the
  generated `jsprismarine_vanilla` overlay pack, a real Bedrock behavior pack declaring all 1477
  palette blocks from the Java-sourced property table, with the 182 Bedrock-only blocks on a reviewed
  exception list rather than a silent default.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b6eccf4`](https://github.com/JSPrismarine/JSPrismarine/commit/b6eccf49493ed702c5c13eb831ad9fa54258a47d) Thanks [@filiphsps](https://github.com/filiphsps)! - Route block power changes through data-driven redstone hooks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e17199e`](https://github.com/JSPrismarine/JSPrismarine/commit/e17199e28be25659495b398dc05d6a48baa2b593) Thanks [@filiphsps](https://github.com/filiphsps)! - Use the interaction rotation from PlayerAuthInput when orienting placed blocks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`18f0d0c`](https://github.com/JSPrismarine/JSPrismarine/commit/18f0d0ca7bfb691c75d2d2453eb21b0126e4a4e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Derive non-colliding vanilla block components from the captured Bedrock geometry table.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9f58b70`](https://github.com/JSPrismarine/JSPrismarine/commit/9f58b7012e39f08ef869149252312f3617c5d057) Thanks [@filiphsps](https://github.com/filiphsps)! - Dispatch entity home-block events through block behavior hooks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e678a6a`](https://github.com/JSPrismarine/JSPrismarine/commit/e678a6a48dd00568f1186f37f2d460b1c898f059) Thanks [@filiphsps](https://github.com/filiphsps)! - Preserve vanilla block tags in generated overlay

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a540a4c`](https://github.com/JSPrismarine/JSPrismarine/commit/a540a4cc5879f62d5d3b39d59100200af8e3d313) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose Bedrock block tags on resolved states

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a4abb61`](https://github.com/JSPrismarine/JSPrismarine/commit/a4abb61b7a03101b4f22ebab35da281066530430) Thanks [@filiphsps](https://github.com/filiphsps)! - Add reusable access to state-specific `minecraft:light_dampening` data. Grass and mycelium now turn to dirt only beneath a dark cover that blocks more than two light levels.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5e47439`](https://github.com/JSPrismarine/JSPrismarine/commit/5e474396321b54f696760962ceb9d24b85917640) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve redstone conductor overrides from `minecraft:redstone_conductivity` block components.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`fc10888`](https://github.com/JSPrismarine/JSPrismarine/commit/fc10888391866037519afbf8e057d4ecece48757) Thanks [@filiphsps](https://github.com/filiphsps)! - Export `PORTAL_BLOCK_NAMES`, the portal blocks, frames and fires the `jsprismarine:portal` family rule matches on, grouped by role, so `@jsprismarine/block-behaviors` reads the same list instead of naming the blocks again.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`6bac6b1`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac6b173e5e283b4e6e3d106268319caa51ed40) Thanks [@filiphsps](https://github.com/filiphsps)! - Send `minecraft:end_gateway` to the `jsprismarine:portal` family instead of `jsprismarine:inert`, which used to claim it first, and drop `nether_portal` from `PORTAL_BLOCK_NAMES` because the Bedrock palette only has `minecraft:portal`. The family tallies in both READMEs now match `vanilla_overlay/report.json`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4ab02e5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ab02e5cf76b88f09ba19106e971337c1da2d1b9) Thanks [@filiphsps](https://github.com/filiphsps)! - Pass sneak state to block interactions so copper doors and trapdoors can wax or scrape correctly.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a3db50e`](https://github.com/JSPrismarine/JSPrismarine/commit/a3db50eef709e1d2e3848d71383d6801d5f69773) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply correct-tool rules to block loot and family drops.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cc8b110`](https://github.com/JSPrismarine/JSPrismarine/commit/cc8b1109b9c174940cdd4549615a05affb459b9a) Thanks [@filiphsps](https://github.com/filiphsps)! - Play container open sounds once per open using block data

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`35e7df5`](https://github.com/JSPrismarine/JSPrismarine/commit/35e7df54b5bba03f65c9e3a972bac32b01ba4fe4) Thanks [@filiphsps](https://github.com/filiphsps)! - Mark vanilla water and lava as non-solid collision volumes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`13792da`](https://github.com/JSPrismarine/JSPrismarine/commit/13792daea4f024f559c9392e93328694db22e164) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve the built-in `corner_and_cardinal_direction`, `sixteen_way_rotation`, and `multi_block_part` trait states.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`a645006`](https://github.com/JSPrismarine/JSPrismarine/commit/a645006caa290b45c728b7ad87435249091cbd56) Thanks [@filiphsps](https://github.com/filiphsps)! - Carry an `onUseOn` behavior's stack result back to the player's hand, so bone meal and other consumables used on a block are spent. An `onPlayerInteract` block hook can now answer with `{ consumed: true, consumesHeldItem: true }`, which the interaction dispatch charges to the hand outside creative; the portal family uses it to spend the eye of ender that fills an end portal frame.
- Updated dependencies [[`f5ea701`](https://github.com/JSPrismarine/JSPrismarine/commit/f5ea701bd7297d63eb524be1d4b76c07cf204569), [`428fd29`](https://github.com/JSPrismarine/JSPrismarine/commit/428fd2953c93ea8472696575798735a4a36ec51b), [`91a7a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/91a7a0bfac2eac8c81961d5263e54b53dc0c3fc5), [`232a1ce`](https://github.com/JSPrismarine/JSPrismarine/commit/232a1ce20b5ade2e33b703300fb671f0c3f62076), [`cde1039`](https://github.com/JSPrismarine/JSPrismarine/commit/cde1039d276df8d3787b361e072fafdb32a6da9a), [`f8a43ce`](https://github.com/JSPrismarine/JSPrismarine/commit/f8a43ce910da3d8e1c88091c8886a7c1d09ab0c0), [`e96d1b7`](https://github.com/JSPrismarine/JSPrismarine/commit/e96d1b76f18207192a9e815e6a2a558a8c4005ff), [`9dffb9a`](https://github.com/JSPrismarine/JSPrismarine/commit/9dffb9aa993febd34d79d0bd40afb4334bcd09fa), [`d4a2a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/d4a2a0b2787e171583e6db0aec1b750e8aeb1e95), [`d66cf52`](https://github.com/JSPrismarine/JSPrismarine/commit/d66cf527b79391e194f85137e1e5b573993c7947), [`d220519`](https://github.com/JSPrismarine/JSPrismarine/commit/d220519e2e460148a90cbde9d643033e27bf8f5e), [`28b5c00`](https://github.com/JSPrismarine/JSPrismarine/commit/28b5c00af0d5377e7030e82d409b6def544619ba), [`f370405`](https://github.com/JSPrismarine/JSPrismarine/commit/f37040563ed0cac590fe971ef3a448cb2e01a581), [`c1591b1`](https://github.com/JSPrismarine/JSPrismarine/commit/c1591b1e567a51dc80ecbbdfdbdc8e7c7f4f6c42), [`c9cafc8`](https://github.com/JSPrismarine/JSPrismarine/commit/c9cafc8529e05fe90ea2812920feb76cbcaf4a1b), [`8518afc`](https://github.com/JSPrismarine/JSPrismarine/commit/8518afc7b9ee684ebe4255ce26e7b56d612a145a), [`4355293`](https://github.com/JSPrismarine/JSPrismarine/commit/4355293f75d669659511516448b9c600900c351b), [`db4b039`](https://github.com/JSPrismarine/JSPrismarine/commit/db4b039894d90ab3a7ee6fc700728adadfc678f5), [`08de1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/08de1bac21f3c5785a02649e4faa11d9a11f82b0), [`0626058`](https://github.com/JSPrismarine/JSPrismarine/commit/06260585d51d8ce0668b7cf854663bb1aea9aee9), [`2fcd89f`](https://github.com/JSPrismarine/JSPrismarine/commit/2fcd89f8ff551915692aedca68cd556735432590), [`91fcf8b`](https://github.com/JSPrismarine/JSPrismarine/commit/91fcf8b9a7c4334c8fab86bc4fae2b94356351d5), [`015a810`](https://github.com/JSPrismarine/JSPrismarine/commit/015a8102014c24f224797dec0b1919d3a045e1c3), [`29aa940`](https://github.com/JSPrismarine/JSPrismarine/commit/29aa940e8ddc1db5bf37b213179adad8e3eb21a5), [`78694d1`](https://github.com/JSPrismarine/JSPrismarine/commit/78694d1577b8bc994963b5eb53d712858ee363df), [`908645b`](https://github.com/JSPrismarine/JSPrismarine/commit/908645b1f8ea87a6e511dbe25675f39760b41627), [`9d93172`](https://github.com/JSPrismarine/JSPrismarine/commit/9d931725e8d48fab773c2fe9f659b2f3e1d26325), [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a), [`f0584a3`](https://github.com/JSPrismarine/JSPrismarine/commit/f0584a381c6bab5c61e5aa2cd3782218bc8d74e7), [`32ce6f2`](https://github.com/JSPrismarine/JSPrismarine/commit/32ce6f2f752e7e89c4445d1936e13a6e243a3a30), [`9e53c61`](https://github.com/JSPrismarine/JSPrismarine/commit/9e53c61399266bf9e26dd87160c45ccd251a21f8), [`8b1bf1b`](https://github.com/JSPrismarine/JSPrismarine/commit/8b1bf1b337e7cb9e1d8f61d8df8b42e2b2badcb6), [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c), [`23450ee`](https://github.com/JSPrismarine/JSPrismarine/commit/23450ee6e61092c05e2cebeca492c95b28e8da0d), [`bed113d`](https://github.com/JSPrismarine/JSPrismarine/commit/bed113d91a2de02b80d5688c3f43eadf802271c4)]:
  - @jsprismarine/minecraft@0.16.0
  - @jsprismarine/mapping@0.16.0
  - @jsprismarine/packs@0.16.0
  - @jsprismarine/content@0.16.0
  - @jsprismarine/molang@0.16.0
