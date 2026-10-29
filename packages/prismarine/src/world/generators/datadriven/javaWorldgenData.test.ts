/**
 * What the registry loader finds in Mojang's real data.
 *
 * Gated the same way the generator's own test is, because it reads the fetched vanilla
 * datapack:
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 * pnpm --filter @jsprismarine/prismarine exec vitest run src/world/generators
 * ```
 */
import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../../../../.test/reportProgress';

import { findJavaWorldgenSources, loadJavaWorldgenRegistries } from './javaWorldgenData';

const sources = findJavaWorldgenSources();
const enabled = sources !== undefined;

describe.skipIf(!enabled)('the Java world generation registries', { tags: ['real-data'] }, () => {
    const registries = enabled ? loadJavaWorldgenRegistries(sources!) : undefined;

    it('reads the structure registries the generator places from', () => {
        expect(registries!.structures.size).toBeGreaterThan(0);
        expect(registries!.structureSets.size).toBeGreaterThan(0);
        expect(registries!.templatePools.size).toBeGreaterThan(0);
        reportProgress(
            `Java worldgen data contains ${registries!.structures.size} structures, ${registries!.structureSets.size} structure sets, and ${registries!.templatePools.size} template pools.`
        );
    });

    it('reads the biome tags a structure names its biomes through', () => {
        expect(registries!.biomeTags.has('minecraft:has_structure/village_plains')).toBe(true);
    });

    it('includes the structure types used by the generator', () => {
        const types = new Set(
            [...registries!.structures.values()].map((document) => (document as { type?: unknown }).type)
        );

        expect(types.has('minecraft:jigsaw')).toBe(true);
        reportProgress(`Java worldgen data uses ${types.size} structure types.`);
    });
});
