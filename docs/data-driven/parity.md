---
title: Parity
group: Documents
category: Guides
---

# Parity: what the project claims and how it is verified

JSPrismarine does not claim 1-1 parity with Java Edition. The claim it does make, adopted by
[the data-driven vanilla plan](../plans/data-driven-vanilla.md) (section 1) from
[the edition behavior research note](../research/edition-behavior-differences.md) (section 14), is:

> JSPrismarine implements Java Edition's gameplay rules for every behavior a server decides, verified against Java Edition's own implementation, and presents them through the Bedrock client's model of the world. Where a Java rule has no Bedrock presentation, or where the Bedrock client decides the outcome locally, the server implements the behavior the client expects.

The narrowing is measured, not argued. Of the 278 classified differences between the editions,
the server decides 213; the claim covers the 186 rows that are server-decided and either
invisible to the player or presentable on a Bedrock client. The rest fall into eight categories
the claim excludes by name, each enumerated in
[the research note](../research/edition-behavior-differences.md) (section 14):

1. **Rendered presentation.** Lighting, particles, models, animations, the HUD and sound selection are drawn by the client from its own data.
2. **Input handling and pose selection.** Reach, shield activation, sneak and sprint toggles and the offhand filter follow the player's device, not the server.
3. **Client-predicted simulation.** Block breaking speed, movement physics and driven vehicles are computed client-side first, so matching Java's constants produces corrections rather than fidelity.
4. **Fixed client registries.** Damage causes, particle types, attributes and enchantment names are enums baked into the client that no packet can extend.
5. **Geometry the client owns.** Entity hitboxes, and block collision and outline shapes beyond what `VoxelShapesPacket` covers.
6. **World generation past the first random draw.** Bedrock's generator is undocumented, so seed-identical terrain stops where randomness starts.
7. **The spawn and cap model.** Java's model is implementable but would change every farm a Bedrock player has built, so Bedrock's stays the default.
8. **Behavior Mojang closed as working as intended on Bedrock.** Overriding those decisions would be a product choice, not a correctness fix.

## Three levels of verification

The research note defines three levels, and the project claims the first two.

**Rule parity.** For a defined input sequence, the server's state transitions match Java
Edition's for the same sequence. The oracle is Java Edition's own implementation, so this is
testable in CI with no client and no network. This is where the claim lives.

**Observable parity.** The packets the server sends produce, on a real Bedrock client, the
outcome Java would show. The oracle is a packet capture from a Bedrock Dedicated Server.

**Bit parity.** Identical values for identical seeds. Only reachable where no random number is
drawn, so the project does not claim it.

## The parity package

`packages/parity` is the test suite behind the claim: Vitest comparisons between what the server
ships and reference data the repository either commits or fetches. It is private and never
published.

```sh
pnpm --filter @jsprismarine/parity run test
```

### Families and test names

Every comparison belongs to a behavior family, one row of the dashboard. A family id is
dot-separated lowercase segments, a group followed by a domain, declared in
[`packages/parity/src/families.ts`](../../packages/parity/src/families.ts).

| Group | Rows | What it measures |
| --- | --- | --- |
| `registry` | blocks, items, entities, biomes | The catalogs the server ships against the Bedrock captures |
| `mapping` | blocks, items, entities, registries, untranslated | Chunker's totality property per mapping domain, and the three registries no published pairing covers |
| `blocks` | properties | Every Bedrock block state's property row against the Java 26.3 jar dump |
| `items` | components | Java's items and data component types against the Bedrock item capture |
| `recipes` | registry | Java's vanilla recipe files, parsed and compiled through the mapping |
| `loot` | tables, distribution | Java's vanilla loot tables, parsed with their references resolved; rolled counts against the weights each table declares |
| `entities` | stats, addactor | The nine shared mob stats against Java's attribute dump; a packet row per actor type |
| `worldgen` | biomes, terrain, corpus, features, structures, determinism | Java's biome lookups and dumped columns, and the generation corpus: this server's own chunk output recorded at a named commit |
| `commands` | tree | The published command tree against Mojang's Bedrock command metadata |
| `conformance` | claim, classification, exclusions | The claim, the table it counts, and the exclusions |

Each test file covers one family and wraps its tests in a top-level `describe` whose title is the
family id. That title is the whole wiring: the dashboard groups tests by splitting the test's full
name, so there is no mapping file to keep in step.

### Reference data, and rows that are not measured

A comparison with nothing on the other side of it is not a pass. Every body of reference data a
family stands on is declared in
[`packages/parity/src/references.ts`](../../packages/parity/src/references.ts), with how this
checkout gets it: committed to the repository, fetched into `node_modules/.cache/jsprismarine/`
by `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`, or built by nothing yet.

`describeFamily` takes the sources a family needs and skips the family when one is missing,
naming what is absent in the skipped test's title. The dashboard shows that row as
`not measured`, which is visually distinct from `green` and does not count toward a pass.

One source is in the third state today: the reference world `dump:bedrock` generates, which
carries both the region to count over and `blockCounts`, the block histogram an ore and feature
count compares against. Mojang publishes Bedrock Dedicated Server as a Linux x86-64 binary and
the capture job runs it, so the golden comes out of CI rather than off a developer's machine.
Until it lands, the terrain row's Java reference is the nine columns the worldgen oracle dumped
rather than a whole world, and no row compares this server's feature placement with Mojang's.

### The generation corpus

Four `worldgen` rows stand on a different kind of reference: a recording this server made of its
own chunk output, committed at
[`packages/parity/goldens/worldgen-corpus.json`](../../packages/parity/goldens/worldgen-corpus.json)
with the commit, the date and the pinned Java data version it was captured at. It exists because
the project is replacing the chunk generator, and the only way to know a rewrite changed nothing
is to have recorded what the old one produced.

Those rows measure change, not parity. A green `worldgen.corpus` says the generator produces what
it produced at the named commit; it says nothing about Java Edition. `worldgen.terrain` remains
the row that compares against Java. `packages/parity/README.md` under "The generation corpus"
says what each of the four covers, what the corpus cost, and what `worldgen.determinism` found.

### The allow list

Some gaps are expected. Each one is a typed entry in
[`packages/parity/src/allowlist.ts`](../../packages/parity/src/allowlist.ts) carrying the family,
the gap id the comparison reports, its kind, the reason, and a reference to where that reason is
written down. A real entry:

```ts
{
    family: 'registry.entities',
    id: 'spawn-egg:minecraft:evocation_illager',
    kind: 'accepted',
    reason: 'The actor keeps the legacy id; the egg item is minecraft:evoker_spawn_egg.',
    reference: 'docs/research/java-to-bedrock-translation.md section 4'
}
```

The kind separates correct behavior from an unfixed problem. An `accepted` gap is right: Bedrock
has no concept for the Java value, or the project chose Bedrock's rule for a recorded reason. A
`defect` is a gap this suite found that nobody has fixed, counted in its own dashboard column, so
a family carrying one reads `defects` rather than `green`.

The reviewed losses and merges of `@jsprismarine/mapping` become allow-list rows derived from
that package's own loss list, which is what the plan (section 5) requires: every loss counted on
the dashboard with its reason.

The list fails in both directions. A gap the comparison reports with no entry fails the family's
test, so a new regression cannot hide behind the known ones. An entry whose gap the comparison no
longer reports also fails, so the list cannot go stale: when a gap closes, its entry must leave in
the same change.

### The goldens

Comparisons read reference data through the loaders in
[`packages/parity/src/goldens.ts`](../../packages/parity/src/goldens.ts): the block palette
snapshot under `packages/minecraft/datagen/snapshot/`, the captures under
`packages/bedrock-data/src/jsp/` (the item list from `ItemRegistryPacket`, the
`BiomeDefinitionListPacket` payload, the Java 26.3 block property and attribute dumps), the
worldgen oracle vectors under `packages/worldgen/vectors/`, and the dumps in the resources
submodule. Tests never read files directly; a new comparison that needs reference data gets a
loader beside the existing ones.

### The dashboard

```sh
pnpm --filter @jsprismarine/parity run dashboard
```

This runs the suite with the Vitest JSON reporter and renders one Markdown table with a row per
declared family: its status, and its passed, failed, not-measured, accepted-gap and defect
counts. A family nobody has written a comparison for still gets a row, reading `no tests`. The
script prints the table to stdout, writes it to `packages/parity/dist/dashboard.md`, and appends
it to `$GITHUB_STEP_SUMMARY` when CI provides one. It exits 0 even when tests fail, because its
job is to report the failures; the test run gates CI separately. The real-data job in
`.github/workflows/test.yml` is where CI publishes it, because that job has the fetched sources
the measured rows need.

### Keeping the claim honest

Three families pin the claim itself.

`conformance.claim` asserts that every published location of the claim carries the adopted
wording verbatim and links to the research note that enumerates the exclusions, and that the
cited note still contains that wording. A wording change has to arrive everywhere in the same
review.

`conformance.classification` parses the classification table out of the research note and checks
every total the published documents state against the rows themselves: the row count, both axis
splits, the area counts and the number of rows the claim covers. A row moving from server-decided
to client-decided changes those totals, so it cannot land without the documents that count it.

`conformance.exclusions` is one negative check per excluded category. Each asserts the exclusion
is still written down wherever the claim is published, since deleting one is how a project starts
claiming something. Four categories leave a mark in the code and get a second check against that
mark rather than against the prose.

## Adding a comparison

1. Pick the family. For a new one, add a constant to `FAMILIES` in
   [`packages/parity/src/families.ts`](../../packages/parity/src/families.ts), following the
   `group.domain` id scheme.
2. Name the reference data the comparison stands on in
   [`packages/parity/src/references.ts`](../../packages/parity/src/references.ts), and add a
   loader for it in [`packages/parity/src/goldens.ts`](../../packages/parity/src/goldens.ts) if
   none reads it yet.
3. Create `packages/parity/src/<family>.test.ts`. Write a compare function that returns gap ids,
   run it through `checkAllowList`, and assert both the `unexpected` and `stale` halves are empty
   inside `describeFamily(FAMILIES.<family>, [<references>], ...)`.
4. For each gap the project accepts, add an allow-list entry of kind `accepted` with a reason and
   a reference. For each gap the comparison found that nobody has fixed, add one of kind
   `defect`.
5. Run the suite and the dashboard; the new family appears as its own row.
