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
| `registry` | <!-- fact:parity.families.registry -->blocks, items, items-2225, items-2259, entities, biomes<!-- /fact --> | The catalogs the server ships against the Bedrock captures |
| `mapping` | <!-- fact:parity.families.mapping -->blocks, items, entities, registries, untranslated, blockentities<!-- /fact --> | Chunker's totality property per mapping domain, and the registries no published pairing covers |
| `blocks` | <!-- fact:parity.families.blocks -->properties, portals, behavior<!-- /fact --> | Every Bedrock block state's property row against the Java jar dump; the portal blocks against the palette capture; and what each Java block does, against the server |
| `items` | <!-- fact:parity.families.items -->components, behavior<!-- /fact --> | Java's item components against the Bedrock item capture; and what each Java item does, against the server |
| `recipes` | <!-- fact:parity.families.recipes -->registry<!-- /fact --> | Java's vanilla recipe files, parsed and compiled through the mapping |
| `loot` | <!-- fact:parity.families.loot -->tables, distribution<!-- /fact --> | Java's vanilla loot tables, parsed with their references resolved; rolled counts against the weights each table declares |
| `entities` | <!-- fact:parity.families.entities -->stats, addactor, behavior<!-- /fact --> | The shared mob stats against Java's attribute dump; a packet row per actor type; and what each Java entity does, against the server |
| `integration` | <!-- fact:parity.families.integration -->tags, block-behaviors, entity-runtime, spawning, entity-coverage, client-packets<!-- /fact --> | Loaded tags through resolved registries; entity behavior, spawning and client join payloads through the server's runtime |
| `worldgen` | <!-- fact:parity.families.worldgen -->biomes, spawn, terrain, features, corpus, structures, determinism, dimensions, blending<!-- /fact --> | Java's biome lookups, spawn chunks and dumped columns; the generation corpus, this server's own output recorded at a named commit; Java's dimension types and presets through the parsers |
| `commands` | <!-- fact:parity.families.commands -->tree, answers<!-- /fact --> | The published command tree and the console's answers against the pinned Bedrock Dedicated Server |
| `gameplay` | <!-- fact:parity.families.gameplay -->end-fight, brain-effects, combat-advancements, raids, datapack, mechanics, block-targets<!-- /fact --> | Java gameplay no single block, item or mob owns: game rules, mob effects, enchantments, damage types, recipes, advancements and player and world systems, plus the End fight, raids and brain effects |
| `protocol` | <!-- fact:parity.families.protocol -->negotiation, wire-roundtrip, dimension-change, java-client, bedrock-exchanges<!-- /fact --> | Each registered protocol version negotiates its own codec from a real first packet; declarative layouts re-encode a real server's bytes; the packet sequence a world change sends round-trips through every codec; what a Java client can do and is shown, one row per behavior, with every packet of the pinned Java release claimed whole by one behavior or split into cases, such as `Game Event`'s game mode and weather, that behaviors share |
| `scripting` | <!-- fact:parity.families.scripting -->lifecycle, events, engine, ui, world, entities, blocks, items, gametest, commands, components, net, admin, debug<!-- /fact --> | What behavior pack scripts record on the pinned Bedrock Dedicated Server against JSPrismarine |
| `java` | <!-- fact:parity.families.java -->transcriptions<!-- /fact --> | Each Java method or field the server's code copies, by its `@javaSource` tag, against the fingerprint of its bytecode in the pinned jar |
| `conformance` | <!-- fact:parity.families.conformance -->claim, classification, exclusions<!-- /fact --> | The claim, the table it counts, and the exclusions |

Each test file covers one family and wraps its tests in a top-level `describe` whose title is the
family id. That title is the whole wiring: the dashboard groups tests by splitting the test's full
name, so there is no mapping file to keep in step.

### Behavior rows come from Java

The `blocks.behavior`, `items.behavior`, `entities.behavior` and `gameplay.mechanics` families list
what each Java block, item, entity and system does, read from Java's own data and the pinned
server jar rather than from what the server implements. A block has a row for each `BlockBehaviour`
hook its Java class overrides, such as using it, its support or its redstone signal, and for its
mining time, blast resistance, piston reaction, light and fire odds. An item has a row for each
Java component it carries and each `Item` hook its class overrides. An entity has a row for each
component its definition declares, each goal its Java class registers and each activity its Java
brain registers. `gameplay.mechanics` has one for each game rule's effect, mob effect,
enchantment, damage type, recipe and advancement, and for the player and world systems Java runs
in code. A row no scenario compares is `not measured` and stays in the behavior score's
denominator, so the score falls when Java has behavior nothing checks.
[`packages/parity/README.md`](../../packages/parity/README.md) lists the sources of each row.

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

`worldgen.dimensions` reads the pinned datapack's four `dimension_type` and seven
`worldgen/world_preset` documents through the public parsers of `@jsprismarine/worldgen` and
compares them with the tables in
[the dimension research note](../research/data-driven-dimensions.md) (sections 1.1, 1.2 and 2.5),
including the three Bedrock overlay rows of `@jsprismarine/mapping`. It then generates chunk 0,0
of each `minecraft:normal` stem at seed 1234 through the shared noise generator and checks the
payload a client would get: blocks inside the Bedrock bounds, biomes the stem's own biome source
can produce, 24, 8 and 16 biome sections for the Overworld, the Nether and the End, and no
structure type without a builder. The Nether and the End have no generation corpus, so this row
and the digests in `javaStructures.test.ts` are what pins their output.

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
worldgen oracle vectors under `packages/worldgen/vectors/<release>/`, and the dumps in the resources
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
job is to report the failures; the test run gates CI separately. The parity dashboard job in
`.github/workflows/ci.yml` is where CI publishes it, because that job has the fetched sources
the measured rows need. In CI the dashboard runs no test of its own: the test shards keep Vitest's
JSON report and the parity side files, and the dashboard job lays them over the complete inputs the
run of the commit `--changed` compared with kept, file by file
(`packages/parity/src/dashboard/inputs.ts`). That commit is the pull request's base, or the newest
earlier master commit whose run kept its inputs while the base's run is still going; the workflow
sets how far back it looks. A run that finds none runs every file and needs no base. For same-repository pull
requests, CI compares the current tracker with that commit's in one comment, naming the commit when
it is not the base. Later runs update the comment.

### Java transcriptions

Code that copies a Java method or field out of the pinned server jar names it with a JSDoc tag:

```ts
/**
 * Water within six steps, up to 65 blocks.
 *
 * @javaSource SpongeBlock.removeWaterBreadthFirstSearch
 */
```

The tag takes a simple class name when one class in the jar has it, a binary name otherwise, and a
descriptor for an overloaded method. `goldens/java-sources.json` records which member each tag
resolves to and a fingerprint of that member's bytecode for each Java release. The fingerprint
hashes a listing that drops what recompiling the same source can change, and it includes the
private methods and lambdas of the same class the member reaches.

A comment that names a Java member without copying it, such as an interface member that describes
what its host does, uses `@javaSee Class.member` instead. The checks resolve it and do not
fingerprint it. [ADR 0031](../adr/0031-copied-java-code-names-its-source.md) records the rule.

`java.transcriptions` resolves every tag in the pinned jar. It fails a row when a `@javaSource`
member is gone or its fingerprint differs from the golden's, naming the code that copies it, and
when a `@javaSee` member no longer resolves. After adding or removing a `@javaSource`, run
`pnpm --filter @jsprismarine/bedrock-data run java:sources --update` to stamp it.
`pnpm run lint:java-sources` checks the tags against the golden without the jar. It also counts
the citations of the form ``Java's `Class.member` `` in JSDoc comments that carry neither tag,
against a baseline that only shrinks. It fails when a file has fewer citations than the baseline
allows as well as more, so after tagging a citation, lower the baseline with
`node scripts/check-java-sources.mts --update-baseline`.

`java:sources --tag <directory>` turns the untagged citations under a directory into tags. It
resolves each citation in the pinned jar, follows an inherited member to the class that declares
it, and adds `@javaSee` instead of `@javaSource` to a comment on a type or an interface member. It
prints each citation it could not settle, such as an overload it cannot choose, for a person to tag.

When a release changes a member, print its listing with `java:sources --list <spelling>` under
each release's `--java`, read the change against the TypeScript, fix the copy if Java's behavior
changed, and restamp with `--update --reviewed <spelling>`.

With the preview's jar in the fetch cache, the family also fingerprints every tag in the preview.
A member the preview changed, moved or removed is a `deferred` row in `goldens/behavior-gaps.json`,
named for the preview, until someone reads it and restamps it with
`--update --java <preview> --reviewed <spelling>`. `java:transcriptions --java <preview>`, which
the Java bring-up runs, writes the diff of each of those members into the preview's delta note.
The [Java transcriptions plan](../plans/java-transcriptions.md) covers the design.

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
4. For each gap the project accepts, add an allow-list entry of kind `intentional` with a reason
   and a reference. For each gap the comparison found that nobody has fixed, add one of kind
   `defect`.
5. Run the suite and the dashboard; the new family appears as its own row.
