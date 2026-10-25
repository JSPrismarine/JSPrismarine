/**
 * The biome half of the world's content groups, over the real biome tables.
 *
 * The first two cases run always: they cover every biome id this server can write, which is
 * exactly the set the data-driven generator can write. The last one generates
 * a real overworld chunk and reads the biomes back out of it, and is gated the same way
 * `generators/datadriven/DataDrivenGenerator.test.ts` is:
 *
 * ```sh
 * JSP_WORLDGEN_VANILLA=1 pnpm --filter @jsprismarine/prismarine exec vitest run src/world/contentAdapter
 * ```
 */
import { bedrockBiomeToJava, javaIdentifierToBedrock } from '@jsprismarine/mapping';
import { constantRandom } from '@jsprismarine/predicates';
import { beforeAll, describe, expect, it } from 'vitest';

import { definitionOf } from '../content/ContentOptions';
import Chunk from './chunk/Chunk';
import { worldContentGroups } from './contentAdapter';
import type { WorldContentBiomes } from './contentAdapter';
import { Dimensions } from './Dimension';
import { DataDrivenGenerator } from './generators/datadriven/DataDrivenGenerator';
import { bedrockBiomeIdOf } from './generators/datadriven/javaTranslation';
import { findJavaWorldgenSources, loadJavaWorldgenRegistries } from './generators/datadriven/javaWorldgenData';
import { World } from './World';

const DIMENSION = 'minecraft:overworld';

/**
 * The biome definitions the groups read, which is all of the content they touch.
 *
 * The real `ServerContent` needs a whole pack stack to build, and
 * `content/world/serverSource.test.ts` covers these groups over one. Here the registry is what
 * matters, so the double is `WorldContentBiomes` rather than a build.
 */
const contentWith = (tags: Readonly<Record<string, readonly string[]>>): WorldContentBiomes => ({
    biomes: Object.entries(tags).map(([identifier, names]) => [
        identifier,
        definitionOf('biomes', identifier, {
            'minecraft:biome': { description: { identifier }, components: { 'minecraft:tags': { tags: names } } }
        })
    ])
});

/** The world's groups over one in-memory chunk at the origin, on a real `World`. */
const groupsOver = (chunk: Chunk, content: WorldContentBiomes) => {
    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map([[Chunk.packXZ(0, 0), chunk]]),
        dimension: Dimensions.Overworld
    });

    return worldContentGroups({
        dimension: DIMENSION,
        world: () => world,
        seed: 0n,
        difficulty: () => 2,
        random: constantRandom(0),
        content: () => content
    });
};

describe('the biome a chunk stores', () => {
    it('resolves every id the generator can write back to a Java biome', () => {
        // Derived from the mapping rather than from a list of numbers kept here: every Bedrock
        // biome with a Java source behind it is one the generator may write.
        const ids = Array.from({ length: 256 }, (_unused, id) => id).filter(
            (id) => bedrockBiomeToJava(id).kind === 'mapped'
        );
        expect(ids.length).toBeGreaterThan(0);

        for (const id of ids) {
            const result = bedrockBiomeToJava(id);
            if (result.kind !== 'mapped') continue;

            // The generator reaches that very id when it is given the Java biome behind it.
            expect(bedrockBiomeIdOf(result.java), `${id}`).toBe(id);

            // And back again: the Java biome the inverse names maps onto the same Bedrock one.
            expect(javaIdentifierToBedrock('biome', result.java)).toEqual({
                kind: 'mapped',
                bedrock: result.bedrock.identifier
            });
        }
    });

    it('answers the identifier and the tags through the world content groups', () => {
        const chunk = new Chunk(0, 0);
        const content = contentWith({ 'minecraft:mesa': ['mesa', 'overworld'] });
        const { blocks } = groupsOver(chunk, content);

        chunk.getBiomes().fillColumn(3, 9, bedrockBiomeIdOf('minecraft:badlands'));

        expect(blocks.biome({ x: 3, y: 64, z: 9 })).toBe('minecraft:mesa');
        expect(blocks.biomeTags({ x: 3, y: 64, z: 9 })).toEqual(['mesa', 'overworld']);
        // The neighbouring column is still what the chunk was filled with.
        expect(blocks.biome({ x: 4, y: 64, z: 9 })).toBe('minecraft:plains');
        expect(blocks.biomeTags({ x: 4, y: 64, z: 9 })).toEqual([]);
    });
});

const sources = findJavaWorldgenSources();
const enabled = process.env.JSP_WORLDGEN_VANILLA === '1' && sources !== undefined;

/** Terrain alone is about 0.6 seconds a chunk, and the biome source runs before it. */
const CHUNK_TIMEOUT = 180_000;

describe.skipIf(!enabled)('the biomes of a generated overworld', () => {
    let generator: DataDrivenGenerator;

    beforeAll(() => {
        const registries = loadJavaWorldgenRegistries(sources!);
        generator = new DataDrivenGenerator({ registries, decorate: false, carve: false });
    }, CHUNK_TIMEOUT);

    it(
        'names every biome the generator wrote into a chunk',
        async () => {
            const named = new Set<string>();

            // Four chunks far enough apart to land in different climates; one chunk is often
            // one biome from the floor to the sky.
            for (const [cx, cz] of [
                [0, 0],
                [40, -40],
                [-80, 120],
                [300, 300]
            ]) {
                const chunk = await generator.generateChunk(cx!, cz!, 1234);
                const { blocks } = groupsOver(chunk, contentWith({}));

                for (let y = Dimensions.Overworld.minY; y < 320; y += 16) {
                    for (let x = 0; x < 16; x += 4) {
                        for (let z = 0; z < 16; z += 4) {
                            const identifier = blocks.biome({ x, y, z });
                            // No fallback and no guess: every id in the column has a name.
                            expect(identifier, `${cx},${cz} at ${x},${y},${z}`).toBeDefined();
                            if (identifier !== undefined) named.add(identifier);
                        }
                    }
                }
            }

            // And each of them has a Java biome behind it, which is the round trip the
            // generator's Java-to-Bedrock pass made on the way in.
            for (const identifier of named) {
                expect(bedrockBiomeToJava(identifier).kind, identifier).toBe('mapped');
            }
            expect(named.size).toBeGreaterThan(1);
        },
        CHUNK_TIMEOUT
    );
});
