# @jsprismarine/parity

The parity test suite of the [data-driven vanilla plan](../../docs/plans/data-driven-vanilla.md)
(section 8): Vitest comparisons between what the server ships and the reference data the
repository carries, with a dashboard. Private, never published.

Every comparison reads committed goldens - the captures under `packages/bedrock-data/src/jsp/`
and `packages/minecraft/datagen/snapshot/`, and the dumps in the resources submodule - so the
suite needs no network and no server and runs in seconds.

## Families

Each test file covers one behavior family, named by its top-level `describe`
(see [`src/families.ts`](src/families.ts)). This slice lands the registry families
(`registry.blocks`, `registry.items`, `registry.entities`, `registry.biomes`) and
`conformance.claim`. The mapping property tests (`mapping.*`) and the Java-golden comparisons
arrive with their own slices and add families without restructuring.

## The allow list

Expected gaps are typed entries in [`src/allowlist.ts`](src/allowlist.ts), each with an
identifier, a reason and a reference. A family's test fails both when a gap has no entry and
when an entry's gap has closed, so the list cannot hide a regression or go stale.
