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
ships and the reference data the repository commits, so the suite needs no network and no running
server. It is private and never published.

```sh
pnpm --filter @jsprismarine/parity run test
```

### Families and test names

Every comparison belongs to a behavior family, one row of the dashboard. A family id is
dot-separated lowercase segments, a group followed by a domain, declared in
[`packages/parity/src/families.ts`](../../packages/parity/src/families.ts). The current families
are `registry.blocks`, `registry.items`, `registry.entities`, `registry.biomes` and
`conformance.claim`; the groups `mapping`, `blocks`, `items`, `recipes`, `loot`, `entities`,
`worldgen` and `commands` are reserved for later slices.

Each test file covers one family and wraps its tests in a top-level `describe` whose title is the
family id. That title is the whole wiring: the dashboard groups tests by splitting the test's full
name, so there is no mapping file to keep in step.

### The allow list

Some gaps are expected. Each one is a typed entry in
[`packages/parity/src/allowlist.ts`](../../packages/parity/src/allowlist.ts) carrying the family,
the gap id the comparison reports, the reason the gap is accepted, and a reference to where that
reason is written down. A real entry:

```ts
{
    family: 'registry.entities',
    id: 'spawn-egg:minecraft:evocation_illager',
    reason: 'The actor keeps the legacy id; the egg item is minecraft:evoker_spawn_egg.',
    reference: 'docs/research/java-to-bedrock-translation.md section 4'
}
```

The list fails in both directions. A gap the comparison reports with no entry fails the family's
test, so a new regression cannot hide behind the known ones. An entry whose gap the comparison no
longer reports also fails, so the list cannot go stale: when a gap closes, its entry must leave in
the same change.

### The goldens

Comparisons read committed reference data through the loaders in
[`packages/parity/src/goldens.ts`](../../packages/parity/src/goldens.ts): the block palette
snapshot under `packages/minecraft/datagen/snapshot/`, the captures under
`packages/bedrock-data/src/jsp/` (the item list from `ItemRegistryPacket`, the
`BiomeDefinitionListPacket` payload), and the dumps in the resources submodule
(`entity_identifiers.dat`, `biome_definitions.json`, `runtime_item_states.json`). Tests never read
files directly; a new comparison that needs reference data gets a loader beside the existing ones.

### The dashboard

```sh
pnpm --filter @jsprismarine/parity run dashboard
```

This runs the suite with the Vitest JSON reporter and renders one Markdown table with a row per
family, counting passed and failed tests plus allow-listed gaps. It prints the table to stdout,
writes it to `packages/parity/dist/dashboard.md`, and appends it to `$GITHUB_STEP_SUMMARY` when CI
provides one. The script exits 0 even when tests fail, because its job is to report the failures;
the test run gates CI separately.

### Keeping the claim honest

Two tests in `conformance.claim` pin the claim itself. One asserts that every published location
of the claim carries the adopted wording verbatim and links to the research note that enumerates
the exclusions; the other asserts the cited note still contains that wording. A wording change has
to arrive everywhere in the same review.

## Adding a comparison

1. Pick the family. For a new one, add a constant to `FAMILIES` in
   [`packages/parity/src/families.ts`](../../packages/parity/src/families.ts), following the
   `group.domain` id scheme.
2. If the comparison needs reference data no loader provides, add a loader to
   [`packages/parity/src/goldens.ts`](../../packages/parity/src/goldens.ts) that reads a committed
   file.
3. Create `packages/parity/src/<family>.test.ts`. Write a compare function that returns gap ids,
   run it through `checkAllowList`, and assert both the `unexpected` and `stale` halves are empty
   inside `describe(FAMILIES.<family>)`.
4. For each gap the project accepts, add an allow-list entry with a reason and a reference.
5. Run the suite and the dashboard; the new family appears as its own row.
