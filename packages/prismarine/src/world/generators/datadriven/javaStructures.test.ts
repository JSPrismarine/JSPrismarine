/**
 * The structures, against Mojang's real data and in real generated chunks.
 *
 * Every case here asserts two things: that the structure starts in the chunk Java's seeded
 * placement puts it in, and that its blocks are in the chunk once it is generated. A structure
 * that lays out but places nothing passes the first and fails the second.
 *
 * Gated, because it reads the Java vanilla datapack, the data generator reports and the
 * structure templates out of the server jar:
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 * pnpm --filter @jsprismarine/bedrock-data run datagen:java
 * JSP_WORLDGEN_VANILLA=1 pnpm --filter @jsprismarine/prismarine exec vitest run src/world/generators
 * ```
 */
import { beforeAll, describe, expect, it } from 'vitest';

import type Chunk from '../../chunk/Chunk';
import { DataDrivenGenerator } from './DataDrivenGenerator';
import { findJavaTemplateSource } from './javaStructureTemplates';
import { STRUCTURE_BUILDERS } from './javaStructureTypes';
import { cacheRoot, findJavaWorldgenSources, loadJavaWorldgenRegistries } from './javaWorldgenData';

const sources = findJavaWorldgenSources();
const enabled = process.env.JSP_WORLDGEN_VANILLA === '1' && sources !== undefined;

/** Generating a chunk that holds a structure runs the whole stack, which is not fast. */
const CHUNK_TIMEOUT = 900_000;

const SEED = 1234;

describe.skipIf(!enabled)('the structures the data-driven overworld generates', () => {
    let generator: DataDrivenGenerator;
    const chunks = new Map<string, Chunk>();

    beforeAll(() => {
        const registries = loadJavaWorldgenRegistries(sources!);
        generator = new DataDrivenGenerator({
            registries,
            templates: findJavaTemplateSource(cacheRoot(), registries.processorLists)
        });
    }, CHUNK_TIMEOUT);

    /** Generates a chunk once and keeps it, because several assertions read the same one. */
    const chunkAt = async (chunkX: number, chunkZ: number): Promise<Chunk> => {
        const key = `${chunkX},${chunkZ}`;
        const cached = chunks.get(key);
        if (cached !== undefined) return cached;

        const chunk = await generator.generateChunk(chunkX, chunkZ, SEED);
        chunks.set(key, chunk);
        return chunk;
    };

    /** Every Bedrock block identifier a chunk holds above the given y. */
    const identifiersAbove = (chunk: Chunk, minY: number): Set<string> => {
        const names = new Set<string>();
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                for (let y = minY; y <= chunk.getMaxY(); y++) {
                    const name = chunk.getBlock(x, y, z).name;
                    if (name !== 'minecraft:air') names.add(name);
                }
            }
        }
        return names;
    };

    describe('a jigsaw structure', () => {
        // Java's random spread placement puts this seed's plains village here. The chunk is far
        // from the origin because the seed's own neighborhood is ocean.
        const VILLAGE_CHUNK = { x: -166, z: -80 };

        it(
            'starts in the chunk the seeded placement chose',
            () => {
                const starts = generator.structureStartsAt(VILLAGE_CHUNK.x, VILLAGE_CHUNK.z, SEED);
                const village = starts.find((start) => start.structure === 'minecraft:village_plains');

                expect(village).toBeDefined();
                expect(village!.chunkX).toBe(VILLAGE_CHUNK.x);
                expect(village!.chunkZ).toBe(VILLAGE_CHUNK.z);
                expect(village!.set).toBe('minecraft:villages');
                expect(village!.step).toBe('surface_structures');
                // A plains village is a town center plus the streets and houses that grew off it.
                expect(village!.pieces.length).toBeGreaterThan(20);
            },
            CHUNK_TIMEOUT
        );

        it(
            'settles the start piece on the surface rather than at the start height',
            () => {
                const village = generator
                    .structureStartsAt(VILLAGE_CHUNK.x, VILLAGE_CHUNK.z, SEED)
                    .find((start) => start.structure === 'minecraft:village_plains')!;

                // `start_height` is an absolute 0 and `project_start_to_heightmap` moves it to the
                // terrain, so a generation point still at 0 would mean the projection never ran.
                expect(village.origin.y).toBeGreaterThan(60);
                expect(village.origin.y).toBeLessThan(200);
            },
            CHUNK_TIMEOUT
        );

        it(
            'puts the village in the generated chunk',
            async () => {
                const chunk = await chunkAt(VILLAGE_CHUNK.x, VILLAGE_CHUNK.z);
                const names = identifiersAbove(chunk, 80);

                // The meeting point's bell, and the parts of a house no feature ever places.
                expect(names).toContain('minecraft:bell');
                expect(names).toContain('minecraft:wooden_door');
                expect(names).toContain('minecraft:glass_pane');
            },
            CHUNK_TIMEOUT
        );
    });

    it(
        'names the structure types that still have no builder',
        () => {
            const registries = loadJavaWorldgenRegistries(sources!);
            const types = new Set(
                [...registries.structures.values()].map((document) => String((document as { type?: unknown }).type))
            );
            const missing = [...types].filter((type) => !STRUCTURE_BUILDERS.has(type)).sort();

            // The inventory of what this server does not generate yet. A family that lands comes
            // off this list, and a type that silently stops generating lands back on it.
            expect(missing).toEqual([
                'minecraft:buried_treasure',
                'minecraft:desert_pyramid',
                'minecraft:end_city',
                'minecraft:fortress',
                'minecraft:igloo',
                'minecraft:jungle_temple',
                'minecraft:mineshaft',
                'minecraft:nether_fossil',
                'minecraft:ocean_monument',
                'minecraft:ocean_ruin',
                'minecraft:ruined_portal',
                'minecraft:shipwreck',
                'minecraft:stronghold',
                'minecraft:swamp_hut',
                'minecraft:woodland_mansion'
            ]);
        },
        CHUNK_TIMEOUT
    );
});
