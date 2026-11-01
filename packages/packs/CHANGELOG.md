# @jsprismarine/packs

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4355293`](https://github.com/JSPrismarine/JSPrismarine/commit/4355293f75d669659511516448b9c600900c351b) Thanks [@filiphsps](https://github.com/filiphsps)! - Run real mcfunctions, and wire eight more of the vanilla commands.
  
  `@jsprismarine/mcfunction` was complete, tested and connected to nothing. `/function` existed in
  the command tree, its host verb refused, and no package depended on the runtime. The two halves
  are joined now. `@jsprismarine/packs` routes a datapack's `.mcfunction` files into a new
  `functions` registry, the one registry whose `data` is text rather than parsed JSON, and the
  server compiles them, resolves function tags through the merged tag table, and runs every line
  through the Brigadier dispatcher with the source made silent, as Java does.
  
  That makes eight things work. `/function`, `/function #tag`, a macro call with an SNBT argument
  compound, `/schedule function ... [append|replace]`, `/schedule clear`, `#minecraft:load` once
  after the packs load, `#minecraft:tick` once a tick, and `/execute as @e[...] run function`, which
  forks the way the rest of an `/execute` chain does. Vanilla ships no functions in either edition,
  so this buys no parity. It is what a third-party Java datapack needs.
  
  Seven more commands this server used to hold back now run. `/scoreboard` keeps objectives, scores
  and the three display slots, which `execute if score`, `execute store result score` and a
  selector's `scores=` all read. `/random` draws from the Xoroshiro128++ stream
  `@jsprismarine/loot` already reproduces for a table's `random_sequence`, so a sequence shared with
  a loot table is one stream. `/xp` reads and writes the two bar attributes through Java's curve and
  gains the `set` form. `/enchant` puts the level on the held stack. `/loot` rolls Java's tables, and
  its `kill` and `mine` sources roll the table of the entity or block they point at rather than one
  the player typed. `/recipe` unlocks out of the compiled recipe book over a new
  `UnlockedRecipesPacket`. `/loot` and `/recipe` are offered only when `content-packs` is on, because
  without the pack stack there is nothing for either to work from.
  
  Breaking in `@jsprismarine/commands`: `runLoot` replaces `DataCommandHost.runLootTable` and takes
  a `LootSource` model rather than a table id, because only one of `/loot`'s four sources names a
  table at all. `ScoreboardCommandHost` gains `holders`.
  `EntityCommandHost.changeExperience` takes the `add` or `set` mode. `/scoreboard players`,
  `execute if score` and `execute store ... score` read Java's `ScoreHolderArgument`, which is a
  selector, a bare name, or `*`, instead of an entity selector, so a fake player parses.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9e53c61`](https://github.com/JSPrismarine/JSPrismarine/commit/9e53c61399266bf9e26dd87160c45ccd251a21f8) Thanks [@filiphsps](https://github.com/filiphsps)! - Refuse to start when a Java identifier has no Bedrock mapping and no reviewed loss.
  
  This is the rule plan section 5 gives the loader, and the reason the mapping module can promise
  totality rather than hope for it. The machinery existed and nothing ran it: `reportIdentifiers`
  and `createPackIdentifierResolver` had no caller outside their own tests, the resolver covered 5
  of the 21 registries the vanilla datapack references, and the one assertion about the vanilla
  corpus expected every identifier to resolve as `unknown`, which is the opposite of what Phase 0
  asks for.
  
  The content build now resolves every Java identifier the pack stack references. A strict build
  throws `UnmappedIdentifierError`, naming the identifier, its registry and the pack and file it
  came from. A normal build keeps going and writes one `identifier.unmapped` error per identifier,
  the way it already reports the defaults it had to invent, so the startup line that counts content
  errors counts these too.
  
  Closing the gap took three things. `@jsprismarine/packs` falls back to the loaded stack when the
  resolver has no answer, which closes a `#tag` whose tag file the stack carries and a reference
  into a registry a datapack fills, such as one loot table calling another; 359 of the vanilla
  corpus's references resolve that way and never cross to a client. It also reads an `id` field from
  the keys beside it rather than always as an item, because 26.3 spells five unrelated things `id`
  and the other four were reaching the report as missing items.
  
  `@jsprismarine/mapping` maps mob effects and potions, joined by name against the pinned
  bedrock-samples metadata, and answers the registries with no Bedrock side from a generated Java
  26.3 census: a reference into one of them resolves only when Mojang's own data publishes the
  entry, so a typo still fails the load. The nine registries the server evaluates in Java's own
  shape are listed with a reason each in `packRegistries.ts`. Five new per-entry losses cover the
  four mob effects and the one potion Bedrock has no id for, and three registry-wide rows cover
  banner patterns, goat horn instruments and painting variants, which do reach a Bedrock client but
  as a short code, a data value and a texture name that no pinned source pairs with the Java id.
  Each registry-wide row pins its entry count, so a version that adds an entry fails the property
  test instead of widening the row in silence.
  
  Against the real 26.3 datapack: 4088 referenced identifiers, 3977 mapped, 111 allow-listed, none
  left over.
  
  Breaking: `ReferencedIdentifier` carries `source`, `pack` and `path`, and a reference the stack
  closes itself now reports `known` rather than `unknown`. `MAPPED_REGISTRIES` and the
  `RegistryLoss` registry union gained `mob_effect` and `potion`, and `RegistriesTable` gained the
  two tables and their Bedrock name sets.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e96d1b7`](https://github.com/JSPrismarine/JSPrismarine/commit/e96d1b76f18207192a9e815e6a2a558a8c4005ff) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/packs`, the Bedrock pack stack loader. `load(stack)` composes directory packs,
  `.mcpack`/`.mcaddon` archives and brarchive layer sets into per-registry definition maps where a
  later pack wins by identifier, and reports diagnostics instead of failing unless `strict` is set.
  It parses lenient JSON (comments, trailing commas), validates manifests against the documented
  schema, dispatches on `format_version`, and parses the Bedrock filter grammar in both the string
  form and the integer `subject`/`operator` encoding.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d66cf52`](https://github.com/JSPrismarine/JSPrismarine/commit/d66cf527b79391e194f85137e1e5b573993c7947) Thanks [@filiphsps](https://github.com/filiphsps)! - `loadDatapack` opens only the files it can route. A vanilla 26.3 datapack is 8373 files of which
  6335 reach a registry; the rest are the worldgen, villager trade and nested built-in pack
  directories this loader does not consume, and each of them cost a syscall pair for bytes that went
  straight back out. Overlay directories are matched by shape - a path that routes once its leading
  directory is dropped - because their names live in the `pack.mcmeta` this also reads.
  
  A declared overlay's file count is still taken over every path in the pack rather than over the
  files that were read, so `mcmeta.empty-overlay` still means what it says for an overlay that holds
  nothing but registries the loader skips.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0626058`](https://github.com/JSPrismarine/JSPrismarine/commit/06260585d51d8ce0668b7cf854663bb1aea9aee9) Thanks [@filiphsps](https://github.com/filiphsps)! - Load the vanilla pack stack in about a third of the time. Two changes, both measured against the
  BDS vanilla layers plus the `jsprismarine_vanilla` overlay plus the Java 26.3 datapack, which is
  what a server boots on: 2573 ms to 951 ms, with a byte-identical set of definitions and
  diagnostics.
  
  - `parseLenientJson` tries strict JSON before the lenient cleanup. The cleanup rewrites the whole
    text character by character twice over to blank out comments and trailing commas, and valid JSON
    has neither outside a string, so it hands a strict file back unchanged. 8486 of the stack's 8556
    Bedrock files are strict, and parsing them strictly costs 74 ms where the cleanup cost 563 ms.
  - `load` opens only the files a registry owns. A pack folder holds much more than definitions - the
    composed vanilla pack ships 1311 `.nbt` structures, a 3 MB `level.dat` and its textures beside
    2588 readable files - and a path no registry routes was read, buffered and then dropped.
    `expandSource` takes a new optional `PackFileFilter` for this; with none it still returns a pack
    whole, and `manifest.json` and the `__brarchive/` containers are read whatever the filter says.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2fcd89f`](https://github.com/JSPrismarine/JSPrismarine/commit/2fcd89f8ff551915692aedca68cd556735432590) Thanks [@filiphsps](https://github.com/filiphsps)! - Validate Bedrock definitions against Mojang's published JSON schemas. `readBedrockSchemas` reads
  `metadata/json_schemas` out of a bedrock-samples checkout, `bedrockSchemaValidator` checks each
  definition against the document for its registry and `format_version`, and `composeValidators`
  joins it to the structural checks rather than replacing them. A file picks its schema by the
  engine's own rule, the same version or the closest one that is not greater, so a file older than
  every published schema checks against none. Six registries have a published root document; the
  other five keep the structural checks alone.
  
  The schemas load with one repair: every `oneOf` reads as `anyOf`. Mojang's generator writes variant
  unions as `oneOf` and the variants overlap, so `Filter Group` and `Block Descriptor` admit no value
  at all when read literally, and the vanilla behavior pack reports 347 violations that are all
  wrong. With the repair both vanilla corpora, the bedrock-samples publication and the composed BDS
  layers, validate with zero schema diagnostics, strict mode included.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`91fcf8b`](https://github.com/JSPrismarine/JSPrismarine/commit/91fcf8b9a7c4334c8fab86bc4fae2b94356351d5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the Java half of the pack loader: a `datapack` stack source reads a Java datapack from a folder
  or zip into eight new registries (`lootTablesJava`, `recipesJava`, `advancements`, `tags`,
  `enchantments`, `damageTypes`, `predicates`, `itemModifiers`), keyed by namespaced id from the 26.3
  directory names. `pack.mcmeta` parses in both the `min_format`/`max_format` and legacy `pack_format`
  forms with overlays, gated on data pack format 121.0; a mismatched pack is reported and still loads
  outside strict mode. Later packs win per file, tags merge with `replace` honored, and
  `reportIdentifiers` walks loaded definitions to report every referenced Java identifier through an
  injectable `IdentifierResolver`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`015a810`](https://github.com/JSPrismarine/JSPrismarine/commit/015a8102014c24f224797dec0b1919d3a045e1c3) Thanks [@filiphsps](https://github.com/filiphsps)! - Give each Java registry its merge mode and tighten overlay resolution. `MERGE_MODES` records
  Java's three modes per registry and `mergeJavaDefinition` applies them, which replaces the
  hardcoded tags branch in the datapack loader: `override` takes the last pack that has the file,
  `tags` concatenates `values` and clears what came before on `replace`, and `assign` merges key by
  key. Every 26.3 data registry but tags overrides.
  
  A declared overlay directory now leaves the base view whether or not its range covers 121.0, so a
  pack with only out-of-range overlays no longer carries their directories as content, and an
  overlay directory the pack does not hold is reported as a warning rather than silently doing
  nothing.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`29aa940`](https://github.com/JSPrismarine/JSPrismarine/commit/29aa940e8ddc1db5bf37b213179adad8e3eb21a5) Thanks [@filiphsps](https://github.com/filiphsps)! - Validate Java datapack definitions against `SpyglassMC/vanilla-mcdoc`.
  `@jsprismarine/packs/mcdocValidator` exports `createMcdocValidator`, which reads a vanilla-mcdoc
  checkout and returns a synchronous `DefinitionValidator`; construction is asynchronous because
  binding the schema modules is, so `load` stays synchronous. Findings name the JSON pointer and the
  reason, and the release gates `#[since=]` and `#[until=]` fields, which matters: the 26.3 vanilla
  datapack reports one finding at 26.3 and thousands at 26.1.
  
  A vanilla-mcdoc finding is a warning by default, because the schema set trails Mojang's releases
  and an error would drop the definition. At 26.3 the one disagreement is
  `recipe/map_extending.json`, which vanilla ships with `"result": {}` where the schema wants an
  `id`. `severity: 'error'` opts into the stricter reading.
  
  The four `@spyglassmc` packages are optional peer dependencies and the module is not re-exported
  from the package index, so the eleven workspace packages importing the loader do not pay for 91
  transitive packages they never load.
  
  `bedrock-data` pins `SpyglassMC/vanilla-mcdoc` in `sources.json`, so `fetch:sources` puts a
  checkout in the cache beside the other pinned upstreams.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`78694d1`](https://github.com/JSPrismarine/JSPrismarine/commit/78694d1577b8bc994963b5eb53d712858ee363df) Thanks [@filiphsps](https://github.com/filiphsps)! - Route `data/*/dimension_type/`, `data/*/dimension/` and the `data/*/worldgen/<kind>/` directories into the `dimensionTypes`, `dimensions` and `worldgen` registries, so a datapack can add a dimension and the worldgen data reaches `Definitions`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`908645b`](https://github.com/JSPrismarine/JSPrismarine/commit/908645b1f8ea87a6e511dbe25675f39760b41627) Thanks [@filiphsps](https://github.com/filiphsps)! - Load the real vanilla Bedrock behavior pack without errors. Four fixes, each against a shape Mojang's
  own files write:
  
  - A brarchive is keyed by its folder path under `__brarchive/` instead of its name. The vanilla
    layers ship `__brarchive/loot_tables/entities.brarchive` beside `__brarchive/entities.brarchive`,
    so the name alone collided and the loot tables overwrote the entity definitions. The composed
    vanilla entity count goes back from 125 to 129, creeper, witch, ghast and copper_golem among the
    recovered ones, and the 302 loot tables and 20 trade tables that landed under the wrong paths are
    back where they belong.
  - An entity section written as `null` reads as absent. 23 vanilla entity files, `area_effect_cloud`
    among them, write `"events": null`.
  - The filter parser accepts a group map that carries more than one combinator, reading it as an
    `all_of` over its clauses; a combinator that holds one test instead of an array; a `domain`
    written as a number or boolean, which `FilterTest.domain` now types the way `value` is typed; and
    the legacy shorthand that names the test in the key, as the skeleton's
    `{"other_with_families": "lightning"}` does. Mojang's `Filter Group Map.json` and
    `Filter Test.json` declare the first three; tnt_minecart, mooshroom, villager, villager_v2, witch,
    piglin and skeleton write them.
  - The vanilla datapack test finds the Java server jar under `java-server/<version>/`, where
    `fetch:sources` writes it, or `java/<version>/`, where the Java dump and oracle scripts download
    their own copy.
  
  A new test behind `JSP_VANILLA_BEHAVIOR_PACK` loads every registry of both the `bedrock-samples`
  publication and the composed BDS vanilla layers and checks the counts.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bed113d`](https://github.com/JSPrismarine/JSPrismarine/commit/bed113d91a2de02b80d5688c3f43eadf802271c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve optional tag members against loaded content and normalize default namespaces.
