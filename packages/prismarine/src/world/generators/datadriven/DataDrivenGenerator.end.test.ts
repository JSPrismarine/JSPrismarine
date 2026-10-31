/**
 * The End's spike pillars against Mojang's real data, end to end through the generator.
 *
 * Gated like `DataDrivenGenerator.test.ts`, because it reads the Java vanilla datapack and the
 * data generator reports. The pillar list is Java's seed derivation (`endSpikesForSeed`), so the
 * test asserts that the chunks the derived list predicts actually hold the pillars: the obsidian
 * column, the bedrock cap, the fire, the iron-bar cage on a guarded spike and the pending
 * crystal spawn with Java's worldgen configuration (vulnerable, no beam, default base plate).
 */
import { endSpikesForSeed } from '@jsprismarine/features';
import { beforeAll, describe, expect, it } from 'vitest';

import type Chunk from '../../chunk/Chunk';
import { Dimensions } from '../../Dimension';
import type { Generator } from '../../Generator';
import { DataDrivenGenerator } from './DataDrivenGenerator';
import { findJavaWorldgenSources, loadJavaWorldgenRegistries } from './javaWorldgenData';

const sources = findJavaWorldgenSources();
const enabled = sources !== undefined;

const SEED = 1234n;

/** A decorated End chunk builds nine terrain tiles plus its own feature pass. */
const CHUNK_TIMEOUT = 300_000;

describe.skipIf(!enabled)('the data-driven End', { tags: ['real-data'] }, () => {
    let end: Generator;

    /** The ten pillars Java derives for the seed; chunk 1 of the plan pins the derivation. */
    const spikes = endSpikesForSeed(SEED);

    beforeAll(() => {
        const registries = loadJavaWorldgenRegistries(sources!);
        end = new DataDrivenGenerator({ registries }).forStem({
            noiseSettings: 'minecraft:end',
            biomeSource: { type: 'minecraft:the_end' },
            dimension: Dimensions.TheEnd
        });
    }, CHUNK_TIMEOUT);

    const blockAt = (chunk: Chunk, x: number, y: number, z: number): string => chunk.getBlock(x & 0xf, y, z & 0xf).name;

    it(
        'grows the first pillar where the seed-derived list predicts it',
        async () => {
            const spike = spikes[0]!;
            // The derivation is pinned in `@jsprismarine/features`; this suite relies on where it
            // points, so a drifted list fails here rather than as a missing pillar.
            expect(spike).toEqual({ centerX: 42, centerZ: 0, radius: 4, height: 97, guarded: false });

            const chunk = await end.generateChunk(spike.centerX >> 4, spike.centerZ >> 4, SEED);

            // The obsidian column runs from the dimension floor to just under the bedrock cap.
            for (let y = chunk.getMinY(); y < spike.height; y++) {
                expect(blockAt(chunk, 42, y, 0), `y ${y}`).toBe('minecraft:obsidian');
            }
            expect(blockAt(chunk, 42, spike.height, 0)).toBe('minecraft:bedrock');
            expect(blockAt(chunk, 42, spike.height + 1, 0)).toBe('minecraft:fire');
            for (let y = spike.height + 2; y <= spike.height + 10; y++) {
                expect(blockAt(chunk, 42, y, 0), `y ${y}`).toBe('minecraft:air');
            }

            // Inside the spike's box but outside its radius the feature clears everything
            // above y 65, which is what frees the silhouette of the pillar.
            for (let y = 66; y <= spike.height + 10; y++) {
                expect(blockAt(chunk, 38, y, 4), `y ${y}`).toBe('minecraft:air');
            }

            // One pending crystal, vulnerable, no beam, the base plate left at the client
            // default: Java's worldgen configuration (`crystal_invulnerable` false, no target).
            const crystals = chunk.getEntitySpawns().filter((spawn) => spawn.type === 'minecraft:ender_crystal');
            expect(crystals).toHaveLength(1);
            expect(crystals[0]).toMatchObject({
                x: spike.centerX + 0.5,
                y: spike.height + 1,
                z: spike.centerZ + 0.5,
                invulnerable: false
            });
            expect(crystals[0]!.beamTarget).toBeUndefined();
            expect(crystals[0]!.showBottom).toBeUndefined();
        },
        CHUNK_TIMEOUT
    );

    it(
        'cages a guarded pillar in iron bars around its crystal',
        async () => {
            const guarded = spikes.find((spike) => spike.guarded);
            expect(guarded).toEqual({ centerX: 12, centerZ: 39, radius: 2, height: 82, guarded: true });

            const chunk = await end.generateChunk(guarded!.centerX >> 4, guarded!.centerZ >> 4, SEED);

            // The cage's walls sit two blocks out from the center, its roof one above the fire.
            expect(blockAt(chunk, guarded!.centerX + 2, guarded!.height, guarded!.centerZ)).toBe('minecraft:iron_bars');
            expect(blockAt(chunk, guarded!.centerX - 2, guarded!.height + 2, guarded!.centerZ)).toBe(
                'minecraft:iron_bars'
            );
            expect(blockAt(chunk, guarded!.centerX, guarded!.height + 3, guarded!.centerZ)).toBe('minecraft:iron_bars');

            expect(blockAt(chunk, guarded!.centerX, guarded!.height - 1, guarded!.centerZ)).toBe('minecraft:obsidian');
            expect(blockAt(chunk, guarded!.centerX, guarded!.height, guarded!.centerZ)).toBe('minecraft:bedrock');
            expect(blockAt(chunk, guarded!.centerX, guarded!.height + 1, guarded!.centerZ)).toBe('minecraft:fire');

            const crystals = chunk.getEntitySpawns().filter((spawn) => spawn.type === 'minecraft:ender_crystal');
            expect(crystals).toHaveLength(1);
            expect(crystals[0]).toMatchObject({
                x: guarded!.centerX + 0.5,
                y: guarded!.height + 1,
                z: guarded!.centerZ + 0.5,
                invulnerable: false
            });
        },
        CHUNK_TIMEOUT
    );
});
