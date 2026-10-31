# @jsprismarine/items

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`440e164`](https://github.com/JSPrismarine/JSPrismarine/commit/440e164b88f43548c9c4fe8ae896387157f21701) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose merged Java datapack tag memberships on resolved block and item types.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d5dc760`](https://github.com/JSPrismarine/JSPrismarine/commit/d5dc760107a1dbc9c5ba9eb5fc9fb544d725c02d) Thanks [@filiphsps](https://github.com/filiphsps)! - Project explicit Bedrock item display names into item registry component data.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c140ef6`](https://github.com/JSPrismarine/JSPrismarine/commit/c140ef6e3072eb97c7a8b123876ea08726ed9910) Thanks [@filiphsps](https://github.com/filiphsps)! - Use scalar Bedrock item components when projecting item registry properties.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b3a2a6f`](https://github.com/JSPrismarine/JSPrismarine/commit/b3a2a6f2d8baca370c541439257bfb4dc4786902) Thanks [@filiphsps](https://github.com/filiphsps)! - Preserve Bedrock item components and tags

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2c459cd`](https://github.com/JSPrismarine/JSPrismarine/commit/2c459cd2ab8822f0364c1ce8e473cf0487b294a8) Thanks [@filiphsps](https://github.com/filiphsps)! - Project Java tool rules to Bedrock digger data

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2d20fee`](https://github.com/JSPrismarine/JSPrismarine/commit/2d20fee23b5fd58cf78dfa12b266f074dab110b8) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose Bedrock tag queries on item stacks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bbda9ea`](https://github.com/JSPrismarine/JSPrismarine/commit/bbda9ea5c0ed57fe60e93c25d6131234a7e8e049) Thanks [@filiphsps](https://github.com/filiphsps)! - New package: the item definition and component runtime. It implements all 122 of Java 26.3's item
  data component types as parsed components for `@jsprismarine/content`, with the value shapes checked
  against Mojang's own per-item reports, and evaluates the `context_int_provider` trees 26.3 moved
  fuel, compost and brewing numbers behind. `ItemStack` is Java's model, a type reference plus a
  component patch over the type's defaults, with the `!component` removal marker representable and
  stacking decided by the patch rather than by NBT comparison. A committed table maps the 1658 Java
  items onto 1605 of Bedrock's 1606 item identifiers, each carrying its Java-sourced components, with
  the 53 items that lose a row listed in a reviewed exception list the generator checks.
  `projectItemToBedrock` turns a type into the component compound `ItemRegistryPacket` carries, shaped
  against a Bedrock Dedicated Server capture, and `flattenItemFacts` precomputes stack size, damage,
  food, tool and burn time into typed arrays. The seven `ItemCustomComponent` hook names are declared
  for the behavior families that come next.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f198a15`](https://github.com/JSPrismarine/JSPrismarine/commit/f198a156a8c307c941efd01a4bd4604eba0f5626) Thanks [@filiphsps](https://github.com/filiphsps)! - Send Bedrock item tag memberships and declared icon textures in the item registry component data.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c1591b1`](https://github.com/JSPrismarine/JSPrismarine/commit/c1591b1e567a51dc80ecbbdfdbdc8e7c7f4f6c42) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the Java data generator step the pipeline was missing. `pnpm --filter
  @jsprismarine/bedrock-data run datagen:java` re-checks the fetched server jar's sha1, runs
  Mojang's `net.minecraft.data.Main` against it, and writes the vanilla datapack to
  `node_modules/.cache/jsprismarine/vanilla-datapack/<version>/` and the data reports to
  `node_modules/.cache/jsprismarine/java-reports/<version>/generated/reports/`, the two
  directories every Java-data reader already looks in. A re-run is a no-op unless `--force` is
  passed.
  
  Nothing produced those directories before, so the data-driven overworld generator failed on
  every server start with a message naming `fetch:sources` and `dump:java`, neither of which
  writes them. Those messages now name `datagen:java`, and so does the pack stack diagnostic for
  a missing Java vanilla datapack.
  
  The mapping and item table generators read `java -version` from stdout, which is empty
  because the banner goes to stderr, so their own fallback run of the data generator always
  threw "No JDK >= 25 found". They read `java --version` now.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b96ce93`](https://github.com/JSPrismarine/JSPrismarine/commit/b96ce93238f3efd66c709f213cd8d5d42fc8f425) Thanks [@filiphsps](https://github.com/filiphsps)! - Spawn eggs now work on targeted entities, and matching eggs create babies for entity data that enables `minecraft:spawn_egg_interaction`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`ef39583`](https://github.com/JSPrismarine/JSPrismarine/commit/ef395830d28b1b242b20a7246c8bb6ec781f5f4c) Thanks [@filiphsps](https://github.com/filiphsps)! - Project Bedrock block placer components

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cd01052`](https://github.com/JSPrismarine/JSPrismarine/commit/cd01052548178421cd323b316d77d87374cee9dc) Thanks [@filiphsps](https://github.com/filiphsps)! - Project Java repair materials into Bedrock item components
- Updated dependencies [[`d4a2a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/d4a2a0b2787e171583e6db0aec1b750e8aeb1e95), [`d220519`](https://github.com/JSPrismarine/JSPrismarine/commit/d220519e2e460148a90cbde9d643033e27bf8f5e), [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c)]:
  - @jsprismarine/content@0.16.0
