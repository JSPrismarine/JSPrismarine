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
| `items.*`       | components                          | Java's 1658 items and 122 component types against the Bedrock item capture                                            |
| `recipes.*`     | registry                            | Java's 2042 recipe files, parsed and compiled through the mapping                                                     |
| `loot.*`        | tables, distribution                | Java's 1447 loot tables, parsed with their references resolved; rolled counts against the weights each table declares |
| `entities.*`    | stats, addactor                     | All nine shared mob stats against Java's attribute dump; a packet row per advertised actor                            |
| `worldgen.*`    | biomes, terrain, features           | Java's biome lookups and dumped columns; feature counts wait on the reference world                                   |
| `commands.*`    | tree                                | The published command tree against Mojang's Bedrock command metadata                                                  |
| `conformance.*` | claim, classification, exclusions   | The claim, the table it counts, and the eight exclusions                                                              |

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

`worldgen.terrain` compares all 3456 heights of the nine whole overworld columns Java's oracle
dumped at seed 1234, plus each column's heightmap and terrain class. Phase 4's exit criterion
names a reference region, which is wider than nine columns; the region golden is the
`worldgen.features` row's missing source, and until it lands the terrain row is green over the
columns and silent about the rest of a chunk.

## The dashboard

```sh
pnpm --filter @jsprismarine/parity run dashboard
```

Runs the suite with the JSON reporter and renders a Markdown table to stdout and
`dist/dashboard.md`, one row per declared family with its status and its passed, failed,
not-measured, accepted-gap and defect counts. In CI the real-data job appends the table to
`$GITHUB_STEP_SUMMARY`. The renderer is a pure function with its own tests,
[`src/dashboard/render.ts`](src/dashboard/render.ts).

## Adding a comparison

1. Add the family id to `FAMILIES` in [`src/families.ts`](src/families.ts).
2. Name the reference data in [`src/references.ts`](src/references.ts), and add a loader for it
   in [`src/goldens.ts`](src/goldens.ts) if no loader reads it yet.
3. Write `src/<family>.test.ts` with a compare function that returns gap ids, wrapped in
   `describeFamily(FAMILIES.<family>, [<references>], ...)`, and assert both halves of
   `checkAllowList` are empty.
4. Give each accepted gap an allow-list entry with a reason and a reference, and each gap the
   suite found and nobody fixed an entry of kind `defect`.
5. Run the suite and the dashboard; the new family appears as its own row.
