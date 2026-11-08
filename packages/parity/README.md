# @jsprismarine/parity

The parity test suite of the [data-driven vanilla plan](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/plans/data-driven-vanilla.md)
(section 8): Vitest comparisons between what the server ships and the reference data the
repository carries, with a dashboard and searchable data-level tracker. Roadmap status and the current milestone are in the plan's
[section 9](../../docs/plans/data-driven-vanilla.md#status-and-current-milestone). Private, never
published.

Most comparisons read committed goldens, so they need no network and no server. A few read the
fetch cache that `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` populates, and on
a checkout without it those rows report "not measured" rather than passing on nothing.

## Families

Each test file covers one behavior family, named by its top-level `describe`
(see [`src/families.ts`](src/families.ts)).

| Group           | Rows                                | What it measures                                                                                                      |
| --------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `registry.*`    | blocks, items, entities, biomes     | The catalogs the server ships against the Bedrock captures                                                            |
| `mapping.*`     | blocks, items, entities, registries, untranslated | Chunker's totality property per mapping domain, with the reviewed losses; the banner pattern, instrument and painting registries no pairing covers |
| `blocks.*`      | properties, portals                 | Every Bedrock block state's property row against the Java 26.3 jar dump; the portal, frame and lighting blocks the portal rules name, with the states they read, against the palette capture |
| `items.*`       | components                          | Java item components carried on mapped Bedrock identities against the item capture                                    |
| `recipes.*`     | registry                            | Java recipe files parsed and compiled through the mapping                                                             |
| `loot.*`        | tables, distribution                | Java loot tables parsed with references resolved; rolled counts against each table's declared weights                |
| `entities.*`    | stats, addactor                     | Shared mob stats against Java's attribute dump; a packet row per advertised actor                                     |
| `integration.*` | tags, block-behaviors, entity-runtime, entity-coverage, spawning, client-packets | Every loaded tag through resolved registries and biome world views; vanilla block behaviors writing states accepted by the Bedrock catalog; a data-driven mob tick; every composed entity declaration through runtime spawn and tick; natural spawning through composed vanilla rules; content-derived join payloads |
| `packs.*`       | composition                        | Active vanilla definitions after layered-pack composition, compared with composing each layer's definitions in order |
| `worldgen.*`    | biomes, spawn, carvers, terrain, corpus, features, structures, determinism, dimensions | Java's biome lookups and climate-selected spawn chunks, source-chunk carver selection, and dumped columns; the generation corpus, this server's own output recorded at a named commit; and Java's dimension types and presets through the parsers, with one chunk per vanilla dimension |
| `commands.*`    | tree                                | The published command tree against Mojang's Bedrock command metadata                                                  |
| `gameplay.*`    | brain-effects, end-fight, raids, datapack | Sniffer digging loot, warden sonic-boom damage, and villager raid host effects against Java 26.3; the End crystal and dragon data used by the respawn fight; every entry of Java's vanilla datapack registries, by whether the server loads it |
| `protocol.*`    | negotiation, wire-roundtrip, dimension-change | Each registered protocol version negotiates its own codec from a real first packet; an unsupported version gets the right `PlayStatus` sidedness; declarative layouts re-encode a real server's bytes; the packet sequence a world change sends round-trips through every codec |
| `conformance.*` | claim, classification, exclusions   | The claim, the table it counts, and the eight exclusions                                                              |

## Behavior scenarios

`blocks.behavior`, `items.behavior`, `entities.behavior` and `gameplay.datapack` measure what the
server does against what Java does, one row per Java block, item, entity or datapack entry. A
scenario in [`src/behaviorScenarios.ts`](src/behaviorScenarios.ts) states one Java rule, picks the
Java subjects it covers from Java's own data (a tag, a component, a registry), runs each through the
server's real handlers, and returns what differed.

- A block, item or entity a scenario reached reads as one row: passed when every scenario that
  reached it agreed with Java, failed when one did not.
- One no scenario reached is **not measured**. It is not a pass: nothing compared its behavior with
  Java, so it stays in the tracker's denominator until a scenario covers it.
- A difference is recorded in [`goldens/behavior-gaps.json`](goldens/behavior-gaps.json) as a
  `defect`, a `deferred` gap or an `intentional` edition difference, each with its reason. The allow
  list reads that file and `checkAllowList` fails both ways, so a new difference fails the suite and
  a fixed one makes its row stale.

Rewrite the baseline after a deliberate change with:

```sh
PARITY_UPDATE_BEHAVIOR_GAPS=1 pnpm --filter @jsprismarine/parity exec vitest run \
    src/blocks.behavior.test.ts src/items.behavior.test.ts \
    src/entities.behavior.test.ts src/gameplay.datapack.test.ts
```

Fix the difference when it is a defect. Record it only when the server cannot match Java yet, and
say why in the row.

## The generation corpus

`worldgen.corpus`, `worldgen.features` and `worldgen.structures` stand on
[`goldens/worldgen-corpus.json`](goldens/worldgen-corpus.json), the one reference here this
server wrote itself. It is a recording of what the chunk generator produced at the commit the
file names, against the Java data version it names, under the capture protocol it names. A
rewritten generator that reproduces it changed no block.

It is not a parity comparison. A green row says the generator still does what it did, not that
what it does is Java's. `worldgen.terrain` is the row that compares against Java, over the nine
columns Java's oracle dumped, and a comparison against Mojang's own feature distribution still
waits on `REFERENCES.referenceWorld`.

### What it covers, and what it cost

Twenty-two chunks at three seeds, in two tiers. A `terrain` chunk skips decoration, so the
generator samples one chunk of noise instead of nine and the chunk costs about a quarter of a
decorated one; it still covers the density functions, the aquifers, the surface rules, the
carvers, the biome source and the structure beards. A `full` chunk runs everything. Fifteen
chunks go to the cheap tier for breadth, seven to the expensive tier for the passes only a
decorated chunk reaches. [`src/generation/plan.ts`](src/generation/plan.ts) carries one line per
chunk saying what it is there for: ocean, a shoreline, hills, a surface at y 126, a chunk 1024
chunks from the origin, the chunk an ocean monument starts in and the one it is written across,
an ocean ruin, an underground jigsaw structure, and inland decoration with no structure at all.

Four chunks are kept block by block rather than as a digest, so a failure can be read instead of
reproduced. Every chunk carries seven digests, one of them per sixteen block section, and a
census of how many blocks of each state it holds.

The structure placement scan is separate and dense. `startsFor` only answers for the chunk it is
asked about, so a sparse scan skips structures, while a contiguous 48 by 48 square reuses the
same laid-out starts across its queries. Three seeds give twenty starts across nine structure
types for about the price of two decorated chunks each.

A full run regenerates all of it in one to two minutes of CPU on a quiet machine, most of it in
the seven decorated chunks and the structure scan.

### Capturing it

```sh
pnpm --filter @jsprismarine/parity run capture:corpus
```

Run it when a generation change is deliberate, and commit the golden in the same change so the
diff shows which chunks moved. The script records the commit, the date, the pinned Java version
and any uncommitted file under the packages that decide what a chunk holds, because a golden
whose vintage is unknown cannot answer the first question anyone asks of it.
`loadGenerationCorpus` refuses a golden captured against a different Java version rather than
comparing against a stale recording.

### What the determinism row found

[`worldgen.determinism`](src/worldgen.determinism.test.ts) checks three properties for chunks at
seed 1234, (0, 0), and seed 987654321, (-96, 48):

- Repeatability: generating the same chunk from scratch twice produces the same block digest.
- Order independence: generating the four cardinal neighbors first does not change the chunk's
  digest.
- Stability after handoff: generating those neighbors after the chunk is returned does not change
  the returned chunk.

All three properties pass for both chunks. The test reports `order-dependent:<seed>/<x>,<z>` or
`mutates-after-handoff:<seed>/<x>,<z>` only when the corresponding digest differs, then checks
both unexpected and stale gaps against [`src/allowlist.ts`](src/allowlist.ts). That family has no
allow-list entries now. It previously had those two defects: the chunk status ladder fixed the
cross-border patch order and stopped patches from changing chunks after handoff, so the entries
were removed. The corpus still captures each chunk from a fresh generator to keep its capture
protocol explicit; the determinism row separately checks behavior across generation order.

### The dimensions row

`worldgen.dimensions` has two halves. The first parses the pinned datapack's four
`dimension_type` and seven `worldgen/world_preset` documents through the public parsers of
`@jsprismarine/worldgen` and compares them, field by field, with the tables in
[the dimension research note](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/research/data-driven-dimensions.md) (sections 1.1, 1.2
and 2.5), the three Bedrock overlay rows of `@jsprismarine/mapping` included. The second
generates chunk 0,0 of each `minecraft:normal` stem at seed 1234 through the one shared noise
generator and reads the payload back the way a client would: blocks stay inside the Bedrock
bounds, every biome is one the stem's own biome source can produce, the Overworld, the Nether
and the End carry 24, 8 and 16 biome sections, and no structure type lacks a builder. The biome
set comes from the stem's `biome_source`, not from a list in the test. The Nether and the End
have no generation corpus; this row and the chunk digests in
`packages/prismarine/src/world/generators/datadriven/javaStructures.test.ts` pin their output.

## Reference data

[`src/references.ts`](src/references.ts) names every body of reference data a comparison stands
on and says how this checkout gets it: committed to the repository, fetched into
`node_modules/.cache/jsprismarine/`, or not built by anything yet. `describeFamily` in
[`src/measure.ts`](src/measure.ts) takes the sources a family needs and skips the family when
one is missing, with a test title naming what is absent.

That is what keeps a green row honest. A comparison with nothing on the other side of it is not
a pass, so the dashboard reports it as `not measured` instead.

Loaders live in [`src/goldens.ts`](src/goldens.ts); tests never read files themselves.

## The allow list

Expected gaps are typed entries in [`src/allowlist.ts`](src/allowlist.ts), each with an
identifier, a kind, a reason and a reference. A family's test fails both when a gap has no entry
and when an entry's gap has closed, so the list cannot hide a regression or go stale.

The kind separates three different cases. `intentional` records an edition or product constraint,
such as a Java value Bedrock cannot represent or a deliberate choice to keep Bedrock behavior.
`deferred` records work with an identified implementation path that has been postponed. A
`defect` is a gap this suite found that nobody has fixed; the dashboard counts each kind in its
own column, and a family carrying a defect reads `defects` rather than `green`.

The reviewed losses of `@jsprismarine/mapping` become allow-list rows automatically, derived
from that package's own loss list, which is what plan section 5 asks for. The three registries
`UNTRANSLATED_REGISTRIES` declares become the `mapping.untranslated` rows the same way, and
that row holds each registry's pinned entry count, so a Java version that adds a banner pattern
fails rather than widening the gap.

The entity stat rows work the same way. Which edition decides a stat is settled in
[ADR 0001](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/adr/0001-entity-stat-authority.md) and held in
`@jsprismarine/entities`; `statRuling` turns a measured disagreement into a verdict and a
reason, and `allowlist.ts` builds the row from that. A `bedrock` or `exception` ruling is an
intentional difference, a `java` ruling is a defect, and the allow-list test fails if a row's kind or
reason drifts from what the decision says.

## What a row does not claim

Two rows measure less than their name suggests, and the difference matters when reading the
dashboard.

`loot.distribution` rolls each table thousands of times from a fixed world seed and runs
Pearson's chi-squared test on the item counts, against the probabilities the table's own
weights and roll counts imply. It checks the roller against Mojang's numbers, which catches a
weight formula that drops a term or a pool that rolls the wrong number of times. It is not a
comparison against Java Edition's observed drops: that needs rolls sampled from a running Java
server, and nothing here captures them. The corpus is the 175 tables whose every draw is a
plain weighted choice between named items, 54 of which draw between two or more; a table with a
`random_chance` condition has a distribution its weights alone do not determine, so
`declaredDistribution` refuses it rather than guessing.

`worldgen.terrain` compares every height in each whole overworld column Java's oracle dumped at
seed 1234, plus each column's heightmap and terrain class. Phase 4's exit criterion
names a reference region, which is wider than nine columns, so the terrain row is green over the
columns and silent about the rest of a chunk. The generation corpus covers the rest of the
chunk, against this server's own earlier output rather than against Java.

`worldgen.features` counts the blocks the decoration pass placed across the corpus's seven
decorated chunks and compares them with the counts the golden recorded. It catches a feature
that stopped running, one that started running in the wrong biome, and an ore whose vein size
moved. It is not the comparison phase 4's exit criterion asks for: that one needs `blockCounts`
from a world a Bedrock Dedicated Server generated, which `REFERENCES.referenceWorld` still waits
on, and this row would pass unchanged if every feature in the corpus had been wrong in the same
way on the day it was captured.

## The dashboard

```sh
pnpm --filter @jsprismarine/parity run dashboard
```

Runs the suite with the JSON reporter and renders a Markdown table to stdout and
`dist/dashboard.md`, one row per declared family with its status and its passed, failed,
not-measured, intentional-difference, deferred, and defect counts. In CI the real-data job appends the table to
`$GITHUB_STEP_SUMMARY`. On same-repository pull requests, the job also runs the dashboard at the
PR's base commit, then creates or updates one comment comparing the current dashboard with that
baseline. The updater searches every comment page for its marker and edits the existing bot comment
in place. The renderer is a pure function with its own tests,
[`src/dashboard/render.ts`](src/dashboard/render.ts).

The same command writes the docs site's tracker to `dist/tracker.json`. It counts named data
comparisons that a family explicitly reports, such as a Java entity's stats, an item identifier,
a recipe, or a worldgen column. This keeps maintenance assertions out of the progress totals and
lets you find a subject such as `minecraft:blaze` even when one Vitest test compares many entities
in a loop. A `not measured:` marker remains visible when reference data is missing, while
intentional differences, deferred work, and known defects appear as separate entries. File paths
and issue references in those entries link to their source.

The entity coverage summary reports aggregate component counts and runtime results. Per-entity
component counts and identifiers for unimplemented components, registered components without
direct hooks, and runtime reports appear in the collapsed **Entity-level details** section. The PR
trend condenses changes to those measurements into added, increased, fell, and removed counts.
No-hook identifiers are grouped by namespace, such as `minecraft[physics,collision_box]`. These
measurements are non-gating; the comparison still gates on source/runtime mismatches, undeclared
active components, unimplemented components, spawn/tick failures, and entity definition errors.

## Adding a comparison

1. Add the family id to `FAMILIES` in [`src/families.ts`](src/families.ts).
2. Name the reference data in [`src/references.ts`](src/references.ts), and add a loader for it
   in [`src/goldens.ts`](src/goldens.ts) if no loader reads it yet.
3. Write `src/<family>.test.ts` with a compare function that returns gap ids, wrapped in
   `describeFamily(FAMILIES.<family>, [<references>], ...)`, and assert both halves of
   `checkAllowList` are empty.
4. Give each intentional difference or deferred item an allow-list entry with a reason and a
   reference, and each gap the suite found and nobody fixed an entry of kind `defect`.
5. Report each compared data item with
   `reportParityCases(FAMILIES.<family>, import.meta.filename, cases)` so the tracker can search
   the identifier and link to the comparison source. Keep allow-list maintenance and coverage
   volume assertions out of the case list.
6. Run the suite and the dashboard; the new family appears as its own row. CI fails when a
   declared family has no test, so any new parity surface needs a comparison that reaches the
   dashboard.
