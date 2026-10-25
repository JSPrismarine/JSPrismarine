/**
 * What the registry loader finds in Mojang's real data.
 *
 * Gated the same way the generator's own test is, because it reads the fetched vanilla
 * datapack:
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 * JSP_WORLDGEN_VANILLA=1 pnpm --filter @jsprismarine/prismarine exec vitest run src/world/generators
 * ```
 */
import { describe, expect, it } from 'vitest';

import { findJavaWorldgenSources, loadJavaWorldgenRegistries } from './javaWorldgenData';

const sources = findJavaWorldgenSources();
const enabled = process.env.JSP_WORLDGEN_VANILLA === '1' && sources !== undefined;

describe.skipIf(!enabled)('the Java world generation registries', () => {
    const registries = enabled ? loadJavaWorldgenRegistries(sources!) : undefined;

    it('reads the structure registries the generator places from', () => {
        expect(registries!.structures.size).toBe(52);
        expect(registries!.structureSets.size).toBe(21);
        expect(registries!.templatePools.size).toBe(245);
    });

    it('reads the biome tags a structure names its biomes through', () => {
        expect(registries!.biomeTags.has('minecraft:has_structure/village_plains')).toBe(true);
    });

    it('covers all sixteen structure types with a definition', () => {
        const types = new Set(
            [...registries!.structures.values()].map((document) => (document as { type?: unknown }).type)
        );

        expect(types.size).toBe(16);
        expect(types.has('minecraft:jigsaw')).toBe(true);
    });
});
