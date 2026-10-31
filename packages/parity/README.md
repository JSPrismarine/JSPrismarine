# @jsprismarine/parity

The parity test suite of the [data-driven vanilla plan](../../docs/plans/data-driven-vanilla.md)
(section 8): Vitest comparisons between what the server ships and the reference data the
repository carries, with a dashboard. Private, never published.

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
| `blocks.*`      | properties                          | Every Bedrock block state's property row against the Java 26.3 jar dump                                               |
| `items.*`       | components                          | Java item components carried on mapped Bedrock identities against the item capture                                    |
| `recipes.*`     | registry                            | Java recipe files parsed and compiled through the mapping                                                             |
| `loot.*`        | tables, distribution                | Java loot tables parsed with references resolved; rolled counts against each table's declared weights                |
| `entities.*`    | stats, addactor                     | Shared mob stats against Java's attribute dump; a packet row per advertised actor                                     |
| `integration.*` | tags, block-behaviors, entity-runtime, entity-coverage, spawning, client-packets | Every loaded tag through resolved registries and biome world views; vanilla block behaviors writing states accepted by the Bedrock catalog; a data-driven mob tick; every composed entity declaration through runtime spawn and tick; natural spawning through composed vanilla rules; content-derived join payloads |
| `worldgen.*`    | biomes, terrain, corpus, features, structures, determinism, dimensions | Java's biome lookups and dumped columns; the generation corpus, this server's own output recorded at a named commit; and Java's dimension types and presets through the parsers, with one chunk per vanilla dimension |
| `commands.*`    | tree                                | The published command tree against Mojang's Bedrock command metadata                                                  |
| `protocol.*`    | negotiation                         | Each registered protocol version negotiates its own codec from a real first packet; an unsupported version gets the right `PlayStatus` sidedness |
| `conformance.*` | claim, classification, exclusions   | The claim, the table it counts, and the eight exclusions                                                              |

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

`worldgen.determinism` asks three things of chunk 0,0 at seed 1234. The same chunk generated
twice from scratch is the same chunk, and that holds. The other two do not:

- A chunk generated after its four neighbors holds different blocks from the same chunk
  generated first.
- A chunk already handed back changes when a neighbor is generated afterwards.

The generator keeps neighbor terrain and cross-border feature output in a per-seed cache and
replays it into terrain it builds later and into chunks it has already returned. Both are
allow-listed as defects, because the chunk status ladder the rewrite is built around cannot
preserve them across worker threads, and because a corpus captured under any other protocol
would record the dependency rather than the generator's output. That is why each corpus chunk is
generated by a generator that has produced nothing else.

### The dimensions row

`worldgen.dimensions` has two halves. The first parses the pinned datapack's four
`dimension_type` and seven `worldgen/world_preset` documents through the public parsers of
`@jsprismarine/worldgen` and compares them, field by field, with the tables in
[the dimension research note](../../docs/research/data-driven-dimensions.md) (sections 1.1, 1.2
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

The kind separates two very different things. An `accepted` gap is correct behavior: Bedrock has
no concept for the Java value, or the project chose Bedrock's rule for a reason the research
records. A `defect` is a gap this suite found that nobody has fixed; the dashboard counts those
in their own column, and a family carrying one reads `defects` rather than `green`.

The reviewed losses of `@jsprismarine/mapping` become allow-list rows automatically, derived
from that package's own loss list, which is what plan section 5 asks for. The three registries
`UNTRANSLATED_REGISTRIES` declares become the `mapping.untranslated` rows the same way, and
that row holds each registry's pinned entry count, so a Java version that adds a banner pattern
fails rather than widening the gap.

The entity stat rows work the same way. Which edition decides a stat is settled in
[ADR 0001](../../docs/adr/0001-entity-stat-authority.md) and held in
`@jsprismarine/entities`; `statRuling` turns a measured disagreement into a verdict and a
reason, and `allowlist.ts` builds the row from that. A `bedrock` or `exception` ruling is an
accepted gap, a `java` ruling is a defect, and the allow-list test fails if a row's kind or
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
not-measured, accepted-gap and defect counts. In CI the real-data job appends the table to
`$GITHUB_STEP_SUMMARY`. On same-repository pull requests, the job also creates or updates one
comment with the current dashboard and its change from the previous report on that PR. The first
report establishes the baseline; later reports call out whether open gaps or measured coverage
increased or fell. The updater searches every comment page for its marker and edits the existing
bot comment in place. The renderer is a pure function with its own tests,
[`src/dashboard/render.ts`](src/dashboard/render.ts).

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
4. Give each accepted gap an allow-list entry with a reason and a reference, and each gap the
   suite found and nobody fixed an entry of kind `defect`.
5. Run the suite and the dashboard; the new family appears as its own row. CI fails when a
   declared family has no test, so any new parity surface needs a comparison that reaches the
   dashboard.
