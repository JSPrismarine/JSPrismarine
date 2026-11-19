# Java data pack version support

Plan, 2026-11-19. The Bedrock side of this repository holds several protocol versions at once:
`sources.json` pins one Bedrock Dedicated Server per protocol, the data pipeline captures and
generates per version, the codec registry carries one preview beside the releases, and the
[protocol-bringup skill](../../.agents/skills/protocol-bringup/SKILL.md) turns a new Minecraft
release into a bounded list of steps. The Java side has none of that. One release, 26.3, is pinned
in one place, its data pack format 121.0 is a constant in `@jsprismarine/packs`, and the release
number is written into comments, type lists and docs across 40 files. This plan gives Java data the
same shape: a version registry with a default release and one preview, per-version generated data,
format gates in the loaders, a bring-up skill and a parity family per version.

The values below are as they were on this date and stay unmarked, as the repository rules say for
dated plans.

## Progress

Branch `docs/java-datapack-version-support`, 2026-11-19.

| Slice | State |
| --- | --- |
| 1. One pin, read everywhere | Done. `resolveJavaRelease`, `readJarVersion`; the pack stack picks the pinned release by name. |
| 2. The registry | Done. `javaServer.defaultVersion` and `versions`, one preview, `--java` on every Java script, `version.json` beside each generated datapack. |
| 3. The target | Done. `JavaDataTarget` in `@jsprismarine/packs`, `content-java-version`, the `level.dat` record and downgrade refusal. |
| 4. Derived-list tests | Done. Every grammar package checks its handlers against the pinned `registries.json`; reviewed lists hold 11 component predicates and the `nbt` and `slots` sub-predicates. |
| 5. The diff tool and the skill | Done. `java:diff`, `bringup:java` with eight stages, the java-bringup skill. |
| 6. Per-version derived data | Done. Goldens, mapping and item tables and worldgen vectors live under `<release>/`; pairs derive from the manifest. |
| 7. The first preview | Done for 26.4 Snapshot 10, format 128.0, data version 5130. Bring-up passes every stage. The preview's mapping and item tables map it onto the 2259 block palette capture ([#3283](https://github.com/JSPrismarine/JSPrismarine/issues/3283)); its vectors wait on [#3284](https://github.com/JSPrismarine/JSPrismarine/issues/3284). |
| 8. Docs | Done. `docs/guide/java-versions.md`, the pipeline and pack pages read the target through facts. |

Open follow-ups from the preview: [#3279](https://github.com/JSPrismarine/JSPrismarine/issues/3279) `crevasse`,
[#3280](https://github.com/JSPrismarine/JSPrismarine/issues/3280) `domain_warp` and the other `upscale` modes,
[#3281](https://github.com/JSPrismarine/JSPrismarine/issues/3281) `noise_biomes`,
[#3282](https://github.com/JSPrismarine/JSPrismarine/issues/3282) material rules that place nothing,
[#3286](https://github.com/JSPrismarine/JSPrismarine/issues/3286) `dispense_behavior` and `block_sound_set`,
[#3287](https://github.com/JSPrismarine/JSPrismarine/issues/3287) the generators' data generator run, and
[#3271](https://github.com/JSPrismarine/JSPrismarine/issues/3271) the vanilla-mcdoc pin.

## 1. What a Java version is here

Three numbers describe a Java release, and they move at different rates.

| Number | Where it comes from | What it gates |
| --- | --- | --- |
| Release id, such as `26.3` or `26.4-snapshot-8` | piston-meta's `version_manifest_v2.json` | The server jar, the cache directory, vanilla-mcdoc's `#[since]` attributes, every "as 26.3 does it" comment |
| Data pack format, such as `121.0` | `version.json` inside the jar, `pack_version.data_major` and `data_minor` | `pack.mcmeta` ranges and overlays, every syntax rename in a datapack |
| Data version, such as `5023` | `version.json`, `world_version` | Chunk stamps, blending, the structure templates' `DataVersion` |

Mojang bumps the data pack format with every snapshot that changes a datapack grammar. The 26.4
cycle went 122.0, 123.0, 124.0, 125.0, 125.1, 126.0 and 127.0 across its first eight snapshots. A
minor bump is backward compatible by Mojang's definition; a major bump marks a breaking change. The
format is therefore the number the loaders gate on, and the release id is the number everything
else is keyed by, because a user, a cache directory and a research note all name a release.

The Java analogue of a Bedrock preview is a snapshot or pre-release. piston-meta publishes a server
jar for every one, the jar carries its own `version.json`, and its data generator runs the same way
as a release's. The repository keeps one, replaced when the next snapshot lands, and drops it when
the release ships. Snapshots arrive weekly, so section 7 says when to re-pin.

## 2. What is per version today

| Data | Where it lives | Per release? | Picked by |
| --- | --- | --- | --- |
| Server jar pin | `packages/bedrock-data/sources.json`, `javaServer` | No, one entry | `loadJavaServerSource` |
| Vanilla datapack and reports | `node_modules/.cache/jsprismarine/vanilla-datapack/<release>/`, `java-reports/<release>/` | Yes, by directory | `packStack.ts` takes the first directory holding a `pack.mcmeta`, whatever its version |
| Structure templates and English strings | `java-structures/<release>/`, `java-lang/<release>/` | Yes, by directory | The pinned release |
| Target format | `DATA_PACK_FORMAT = [121, 0]` in `packages/packs/src/mcmeta.ts` | No, a constant | Every datapack load |
| Target release for schema checks | `DATA_PACK_RELEASE = '26.3'` in `mcdocValidator.ts` | No, a constant | The optional mcdoc validator |
| Registry directory names | `javaRegistries.ts`, `WORLDGEN_REGISTRY_KINDS` | No, the 26.3 spellings | Path routing |
| Grammar parsers | `@jsprismarine/loot`, `predicates`, `recipes`, `advancements`, `features`, `structures`, `worldgen`, `items`, `enchantments`, `commands` | No, the 26.3 grammars, with the `id`/`properties` block state keys and the `modifier`/`condition`/`type` loot keys | Every parse |
| Hand-written type lists ("the 58 feature types Java 26.3 registers") | `Feature.ts`, `modifiers.ts`, `blockPredicate.ts`, `MaterialRule.ts`, `DensityFunction.ts`, `processors.ts`, `subpredicates.ts`, `catalog.ts`, `gamerules.ts` | No | Parse-time dispatch |
| Java goldens | `packages/bedrock-data/src/jsp/java/` (`block_properties`, `entity_attributes`, `entity_goals`, `entity_navigation`) | No, one capture | `dump:java`, `dump:java-goals` |
| Mapping tables and loss lists | `packages/mapping/src/tables/`, `lossList.ts`, `blockMapping.ts` | No, 26.3 against BDS 1.26.51.1 | `generate:tables` |
| Item types with Java default components | `packages/items/src/tables/itemTypes.json` | No | `generate:item-types` |
| Blending data versions | `GENERATION_DATA_VERSION = 5023`, `OLD_GENERATION_BELOW_DATA_VERSION = 4997` | No | `@jsprismarine/worldgen` |
| Worldgen test vectors | `packages/worldgen/vectors/*.json` | No, read from the 26.3 jar | Vector suites |
| Parity fixtures | `packages/parity/src/javaDatapack.ts`, `references.ts` | No | Every Java parity row |
| Docs facts | `java.version`, `java.datapack.*` in `tools/docs/facts.mts` | No | `docs:facts` |
| Command schema | `commands/src/commands/javaSchema.ts`, from `reports/commands.json` | No | Command tree |

Two defects show up in the table. `packStack.ts` and `vanillaDatapack.test.ts` each pick a version
directory by listing the cache and taking the first hit, so a cache that holds two generated
releases serves whichever `readdirSync` returns first. And `utils/java-dump/run.mjs` keeps
`REQUIRED_JDK_MAJOR = 25` as its own constant while `datagen.ts` reads `java_version` from the jar.
Both are fixed in slice 1.

## 3. Design

### The registry

`sources.json` gains the shape the `bds` section has:

```json
"javaServer": {
    "defaultVersion": "26.3",
    "versions": {
        "26.3": { "url": "...", "sha1": "...", "sha256": "...", "sizeInBytes": 62294556 },
        "26.4-snapshot-8": { "preview": true, "url": "...", "sha1": "...", "sha256": "...", "sizeInBytes": 0 }
    }
}
```

`defaultVersion` is the release the server runs and advertises in its docs. At most one entry is a
preview, it must be newer than the default, and `loadSourceDescriptors` refuses a manifest that
breaks either rule, the way `ProtocolCodecRegistry` refuses a second Bedrock preview. The format
and data version are not written into the manifest. `datagen.ts` reads them from the jar's
`version.json` and writes them beside the generated data as `vanilla-datapack/<release>/version.json`,
so a committed number cannot drift from the jar it describes.

Every script that reads `javaServer.version` today (`datagen.ts`, `ensure-worldgen.ts`,
`extract-lang.ts`, `java-dump/run.mjs`, `java-goals/run.ts`, `real-data-env.mts`,
`share-worktree-cache.ts`, the mapping and items generators, `facts.mts`) takes `--java <release>`
and falls back to `defaultVersion`, as the Bedrock scripts take `--protocol`.

### The runtime target

The server loads one Java data set at a time. World generation, loot, recipes and the command tree
all come from the same datapack, and a save's chunks carry that release's data version. There is
no per-client choice to make, which is where this differs from Bedrock protocols. A preview exists
so the repository can bring it up, test it and switch to it, not so one server serves both.

So the target is a value, not a constant. A new type in `@jsprismarine/packs`:

```ts
interface JavaDataTarget {
    readonly release: string;        // "26.3"
    readonly format: PackFormat;     // [121, 0]
    readonly dataVersion: number;    // 5023
}
```

`load(stack, { java: target })` gates `pack.mcmeta` ranges and overlays on `target.format` in place
of `DATA_PACK_FORMAT`, and the mcdoc validator takes `target.release` in place of
`DATA_PACK_RELEASE`. `packStack.ts` builds the target from the chosen release's `version.json` in
the cache. The release comes from `defaultVersion` unless the config's new `content-java-version`
names another pinned one, which is how a maintainer runs a server on the preview. The composed
prefix cache key includes the release.

The datapack format a loaded world was generated with is recorded in `level.dat` beside the
blending data version it already has. Starting a world with a newer target is allowed and blends
old chunks as the blending plan describes. Starting it with an older target is refused with an
error from the catalog, because Java has no downgrade path either.

### Gates in the parsers

Grammar changes get the treatment packet layouts get. A parser that has to read two spellings
reads the target's format and chooses, with one comparison per change:

```ts
/** 26.3 (format 121) renamed `functions` to `modifier` in loot pool entries. */
const SINCE_LOOT_MODIFIER_KEY = 121;
```

The constant lives in the package that owns the grammar, is named for the change rather than the
release, and is compared against `target.format[0]`. Ungated code says nothing about versions, per
the repository's rule on version comments. The existing `UNTIL_`/`SINCE_` convention in
`packages/protocol` is the model.

Hand-written type lists become derived where a report lists them. `reports/registries.json`
names every `feature_type`, `placement_modifier_type`, `material_rule` type, `game_rule` and data
component. Each package keeps its handler map, and a test loads the target's registry report and
fails when a registered type has no handler and no entry in a reviewed `unhandled` list. That is
the Java counterpart of the substitution-list test the cross-version Bedrock note asks for, and it
is what turns "26.4 added a type" from a silent gap into a failing test on the preview.

The list of 26.3 grammar renames in [java-registries-and-components.md](../research/java-registries-and-components.md)
(loot keys, block state keys, number providers, the three worldgen folder renames) stays as the
record of what format 121 changed. The first gates are the ones the 26.4 preview needs, found by the
mechanical diff in section 5, not a retrofit of 26.2 support.

### Per-version derived data

Generated and captured data that depends on the Java release moves under a release directory,
as the Bedrock data lives under `v<protocol>`:

- `packages/bedrock-data/src/jsp/java/<release>/` for the four goldens, with the unversioned path
  kept as the default release's copy until every reader passes a release.
- `packages/mapping/src/tables/<release>/` and `packages/items/src/tables/<release>/`, generated for
  each (Java release, Bedrock protocol) pair the manifest names. The pairs are the default release
  with the default protocol and the preview with the preview, since Mojang ships one game drop to
  both editions, and the 26.4 winter drop is paired with Bedrock 1.26.70.
- `packages/worldgen/vectors/<release>/` for the vectors read from the jar, and
  `generationVersion.ts` reading its two numbers from the target instead of exporting constants.

The generated size doubles while a preview is pinned and returns when it is dropped. The preview's
directory is deleted, not kept, when the release ships, exactly as the Bedrock rule says.

### Third-party packs

A pack whose range does not cover the target format gets the same error diagnostic as today and
still loads outside strict mode, which matches Java's own warning-and-load behavior. The plan adds
no automatic upgrade of a pack written for an older format. Java has no datafixer for datapacks,
and a rename shim for every major bump is open-ended work; section 8 lists it as a decision. The
`overlays` support already in `mcmeta.ts` is the supported way for a pack to cover two formats, and
a preview target is what lets a pack author test an overlay for the next format before it ships.

## 4. Bring-up

A new skill, `.agents/skills/java-bringup/SKILL.md`, mirrors protocol-bringup step for step.
Bringing up Java release R means: pin the jar, generate its data, derive the delta from the
previous release mechanically, implement it as gates, regenerate every derived table, and prove the
result through the loaders and the parity suite. The steps:

1. **Pin.** Find R in piston-meta, copy the server download's URL and sha1, measure sha256 and
   size, add the entry under `javaServer.versions`. For a snapshot set `"preview": true` and
   replace the previous preview. Done when `fetch:sources --java R` verifies the hash.
2. **Generate.** `datagen:java --java R`, twice. Done when the two runs are byte-identical and
   `vanilla-datapack/R/version.json` names the expected format and data version.
3. **Mechanical diff.** `pnpm run java:diff <old> R` (a new script in `packages/bedrock-data`)
   diffs the two generated datapacks and report sets file by file and prints added, removed and
   renamed directories, added and removed registry entries from `registries.json`, added and
   removed keys per grammar sampled over every file of a registry, and the block, item and entity
   deltas from `blocks.json` and `registries.json`. Record it as
   `docs/research/java-<R>-delta.md`, shaped like `protocol-2225-delta.md`, cross-checked against
   Mojang's changelog for the release. Done when every changed directory, key and registry entry is
   listed with its source.
4. **Gates.** One `SINCE_` constant per grammar change in the owning package, with a test per
   change that parses the old and the new spelling under the matching targets. The derived-list
   tests from section 3 name the new types to handle. Done when the strict load of R's vanilla
   datapack reports no diagnostics and the corpus suites in `loot`, `recipes`, `predicates`,
   `advancements`, `features` and `structures` pass against R.
5. **Derived data.** `dump:java --java R`, `dump:java-goals --java R`, `generate:tables` and
   `generate:item-types` for R's pair, the worldgen vectors for R. New Java identifiers with no
   Bedrock counterpart go into the reviewed loss lists before the generators emit. Done when each
   generator runs twice with an empty diff.
6. **Prove it.** `pnpm run bringup:java --java R` boots a server on R with a flat world, loads the
   full stack in strict mode, generates one noise chunk per dimension, runs the command tree
   build, and prints a pass or fail per stage, as `bringup --protocol` does for Bedrock. Then the
   parity family in step 7. Done when every stage passes.
7. **Parity family.** A declared family `datapack.<R>` under `packages/parity` that loads R's
   vanilla datapack through the public loader and asserts the registry counts and corpus results
   against R's own reports. The default release keeps the existing families; the preview gets its
   own row, so the dashboard shows both. CI fails a declared family with no test.
8. **Flip the default**, when R is a release. Change `defaultVersion`, delete the preview entry
   and its directories, run `docs:facts`, update `blending.json` and the guide pages that say
   which release the server runs. Done when `pnpm run test` passes with the old release's
   directories gone and `git grep 26\.3` outside dated notes finds only gates named for a change.

A capture workflow, as `.github/workflows/capture.yml` does for Bedrock, runs steps 1 to 3 against
the newest snapshot on a schedule and opens a pull request carrying the delta note and the
generated `version.json`. The maintainer then does steps 4 to 7 by hand, or closes the pull request
when the snapshot's format did not move.

## 5. Slices

Each slice is a commit set that passes on its own. The order puts the defects first and the
preview last, so the default release keeps working throughout.

1. **One pin, read everywhere.** Move `java-dump/run.mjs` onto the jar's `java_version`, make
   `packStack.ts` and `vanillaDatapack.test.ts` resolve the release by name instead of by
   `readdirSync` order, and route every script's release through one `resolveJavaRelease(argv)`
   helper in `utils/java/`. No behavior change for a single-release cache.
2. **The registry.** `javaServer.versions` with `defaultVersion`, the one-preview rule and its
   tests, `--java` on each script, `version.json` written by `datagen.ts`. The existing 26.3 entry
   becomes the default.
3. **The target.** `JavaDataTarget`, `load(stack, { java })`, `content-java-version`, the
   `level.dat` record and the downgrade refusal, the `java.*` docs facts reading the default
   release's `version.json`. `DATA_PACK_FORMAT` and `DATA_PACK_RELEASE` stay exported for one
   release as the default target's values, with a Changeset marking them deprecated.
4. **Derived-list tests.** The handler-versus-report test per package from section 3, with every
   current gap in a reviewed list. This slice finds nothing new on 26.3 and is what makes the
   preview's gaps visible.
5. **The diff tool and the skill.** `java:diff`, `bringup:java`, the skill file with its symlink
   under `.claude/skills/`, and the dated research note template.
6. **Per-version derived data.** Release directories for the goldens, mapping tables, item types
   and vectors, with the generators taking the pair from the manifest.
7. **The first preview.** Pin the newest 26.4 snapshot, run the skill end to end, land the gates
   its delta note needs and the `datapack.26.4-snapshot-<n>` family. This slice is where the
   design is proven; expect the loot, worldgen and block state grammars to be the ones that move.
8. **Docs.** `data-pipeline.md`'s version bump section becomes a pointer to the skill,
   `using-packs.md` says the target is the configured release's format, and a new
   `docs/guide/java-versions.md` page says which release the server runs, which preview it tracks
   and what `content-java-version` does, with facts for the numbers.

## 6. Verification

Deterministic checks only, per the repository's measurement rule.

- `fetch:sources --java R` verifies the hash; a manifest with two previews or a preview older
  than the default fails to load, with unit tests on the resolver.
- `datagen:java` run twice is byte-identical, asserted by the bring-up tool on `version.json`,
  `pack.mcmeta` and a file count.
- Each `SINCE_` gate has a two-sided test: the old spelling parses under the old target, the new
  under the new, and each fails under the other where the grammar is incompatible.
- The derived-list tests fail when a report names a type with no handler and no reviewed entry.
- The parity family per release loads the real datapack through the public loader and asserts the
  counts from that release's reports.
- `bringup:java` passes every stage against the default and the preview, and CI runs it for both
  on the schedule the capture workflow sets.
- A client-e2e scenario joins a server started with `content-java-version` set to the preview and
  reaches spawn on a flat world, run with `pnpm run e2e:client`.

## 7. When to re-pin the preview

Snapshots arrive weekly and the format moved in seven of 26.4's first eight. Re-pinning every
snapshot would cost a bring-up a week. The rule: re-pin when the data pack format major changes or
when Mojang publishes a pre-release, and otherwise let the scheduled workflow's diff note sit
unmerged. A minor-only bump is backward compatible by Mojang's definition and needs no gate, so the
pull request for it is closed with the note attached to the tracking issue.

## 8. Decisions for the maintainer

All five were accepted as recommended on 2026-11-19.

1. **Key by release id.** Directories, manifest entries and parity families are keyed by the
   piston-meta id (`26.3`, `26.4-snapshot-8`). Gates compare the format major. The alternative,
   keying everything by format, breaks when one release cycle passes through six formats.
2. **One target per server.** `content-java-version` picks one pinned release for the whole
   server. Serving two Java data sets at once is out of scope; nothing in the client-facing path
   needs it.
3. **No automatic pack upgrade.** A pack for an older format loads with an error diagnostic, as
   today. If pack authors ask for it, a rename shim for the previous format major is a later plan,
   and the delta notes this plan produces are its input.
4. **Pairs, not a matrix.** Mapping and item tables are generated for two (Java, Bedrock) pairs,
   default with default and preview with preview. A Java preview without a Bedrock preview pairs
   with the default protocol and records the new identifiers as losses until the Bedrock side
   catches up.
5. **Preview cadence.** Section 7's rule, or every snapshot if the maintainer wants the skill
   exercised more often.

## 9. Risks

- 26.4 renames more than its predecessors did. The 26.3 delta touched loot, predicates, worldgen
  folders and block state keys at once, and a gate per change is bounded work only while the
  mechanical diff lists every change. The diff tool in slice 5 is what keeps that true.
- vanilla-mcdoc may lag a snapshot. The mcdoc validator is optional and warning-level, so a lagging
  schema set costs diagnostics, not a failed load. The pin moves when the schema set catches up.
- The JDK floor rises. 26.3 needs Java 25; a later release may need 26. `datagen.ts` already reads
  the floor from the jar and `findJdkHome` already reports the gap, so this is a documentation
  change when it happens.
- The generated data doubles in the cache while a preview is pinned, about 100 MB. The shared
  worktree cache already stores each release once per machine.
- Hand-transcribed Java behavior (the entity brains, block growth, the blender) is pinned to 26.3
  in comments and in values. The plan does not re-transcribe them per release; a delta note lists
  the classes whose bytecode changed, from the existing class-file reader in `java-goals`, so the
  maintainer knows which transcriptions to re-read.

## Sources

- Bedrock version handling: [protocol-bringup](../../.agents/skills/protocol-bringup/SKILL.md),
  [cross-version-bedrock-data.md](../research/cross-version-bedrock-data.md),
  `packages/protocol/src/ProtocolCodecRegistry.ts`, `packages/bedrock-data/sources.json`.
- Java format history and 26.3 renames:
  [java-registries-and-components.md](../research/java-registries-and-components.md),
  [java-datapacks.md](../research/java-datapacks.md).
- 26.4 snapshot formats: the Minecraft wiki's
  [26.4 development versions](https://minecraft.wiki/w/Java_Edition_26.4/Development_versions)
  and Mojang's [Snapshot 8 article](https://www.minecraft.net/en-us/article/minecraft-26-4-snapshot-8),
  read 2026-11-19.
- Current pipeline: [data-pipeline.md](../data-driven/data-pipeline.md),
  `packages/bedrock-data/utils/java/datagen.ts`, `worldgen-cache.ts`,
  `packages/prismarine/src/content/packStack.ts`, `packages/packs/src/mcmeta.ts`.
