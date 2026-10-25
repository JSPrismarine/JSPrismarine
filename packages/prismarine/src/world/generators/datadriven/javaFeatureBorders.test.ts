/**
 * The decoration pass across a chunk border, against Mojang's real data.
 *
 * Gated the same way as the rest of the generator suite:
 *
 * ```sh
 * vitest run packages/prismarine/src/world/generators
 * ```
 */
import { beforeAll, describe, expect, it } from 'vitest';

import type Chunk from '../../chunk/Chunk';
import { DataDrivenGenerator } from './DataDrivenGenerator';
import { findJavaWorldgenSources, loadJavaWorldgenRegistries } from './javaWorldgenData';

const sources = findJavaWorldgenSources();
const enabled = sources !== undefined;

/** Decorating one chunk drives nine feature passes over twenty-five terrain tiles. */
const CHUNK_TIMEOUT = 600_000;

/**
 * An oak at seed 987654321 whose trunk stands in the last column of chunk -97,48.
 *
 * Found by scanning the three by three of chunks around the corpus's tall decorated chunk for
 * positions where both sides of a border hold wood. The trunk occupies local x 15, z 3 of
 * -97,48 at y 126 to 129, and the crown reaches two columns into -96,48.
 */
const TREE = {
    seed: 987_654_321,
    trunk: { chunkX: -97, chunkZ: 48, localX: 15 },
    crown: { chunkX: -96, chunkZ: 48 },
    localZ: 3
} as const;

/** What the crown's two columns in the next chunk hold, lowest y first, from y 126. */
const CROWN_COLUMNS = [
    [
        'minecraft:leaf_litter',
        'minecraft:oak_leaves',
        'minecraft:oak_leaves',
        'minecraft:oak_leaves',
        'minecraft:oak_leaves'
    ],
    ['minecraft:air', 'minecraft:oak_leaves', 'minecraft:oak_leaves', 'minecraft:air', 'minecraft:air']
] as const;

/** The lowest y of {@link CROWN_COLUMNS}. */
const CROWN_FLOOR = 126;

describe.skipIf(!enabled)('a feature that straddles a chunk border', () => {
    let crownAlone: Chunk;
    let trunkChunk: Chunk;

    const fresh = (): DataDrivenGenerator =>
        new DataDrivenGenerator({ registries: loadJavaWorldgenRegistries(sources!) });

    const columnFrom = (chunk: Chunk, localX: number): string[] =>
        CROWN_COLUMNS[0]!.map((_entry, step) => chunk.getBlock(localX, CROWN_FLOOR + step, TREE.localZ).name);

    beforeAll(async () => {
        // A generator that has produced nothing else, which is the case the old generator got
        // wrong: it decorated a three by three window and kept only the middle, so whatever a
        // neighbor's feature pass wrote into this chunk was thrown away.
        crownAlone = await fresh().generateChunk(TREE.crown.chunkX, TREE.crown.chunkZ, TREE.seed);
        trunkChunk = await fresh().generateChunk(TREE.trunk.chunkX, TREE.trunk.chunkZ, TREE.seed);
    }, CHUNK_TIMEOUT);

    it('stands on a trunk in the chunk next door', () => {
        const trunk = ['minecraft:oak_log', 'minecraft:oak_log', 'minecraft:oak_log', 'minecraft:oak_log'];
        expect([126, 127, 128, 129].map((y) => trunkChunk.getBlock(TREE.trunk.localX, y, TREE.localZ).name)).toEqual(
            trunk
        );
    });

    it('is whole in a chunk generated on its own', () => {
        expect(columnFrom(crownAlone, 0)).toEqual([...CROWN_COLUMNS[0]]);
        expect(columnFrom(crownAlone, 1)).toEqual([...CROWN_COLUMNS[1]]);
    });

    it(
        'is the same crown whether the chunk the trunk stands in was generated first or not at all',
        async () => {
            const after = fresh();
            await after.generateChunk(TREE.trunk.chunkX, TREE.trunk.chunkZ, TREE.seed);
            const crownAfter = await after.generateChunk(TREE.crown.chunkX, TREE.crown.chunkZ, TREE.seed);

            expect(crownAfter.networkSerialize().equals(crownAlone.networkSerialize())).toBe(true);
        },
        CHUNK_TIMEOUT
    );
});
