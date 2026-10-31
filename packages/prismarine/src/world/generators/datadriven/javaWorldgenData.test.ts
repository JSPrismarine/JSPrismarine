/**
 * What the registry loader projects out of a loaded pack stack.
 *
 * The real-data cases are gated the same way the generator's own test is, because they read
 * the fetched vanilla datapack:
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 * pnpm --filter @jsprismarine/prismarine exec vitest run src/world/generators
 * ```
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { load } from '@jsprismarine/packs';
import { afterAll, describe, expect, it } from 'vitest';

import { reportProgress } from '../../../../../../.test/reportProgress';

import {
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries,
    loadJavaWorldgenRegistriesFrom
} from './javaWorldgenData';

const sources = findJavaWorldgenSources();
const enabled = sources !== undefined;

/** Writes a datapack of a few files to a temporary directory and returns its root. */
const writeDatapack = (files: Readonly<Record<string, unknown>>): string => {
    const root = mkdtempSync(join(tmpdir(), 'jsp-worldgen-datapack-'));
    writeFileSync(join(root, 'pack.mcmeta'), JSON.stringify({ pack: { pack_format: 121, description: 'test' } }));
    for (const [path, document] of Object.entries(files)) {
        mkdirSync(join(root, path, '..'), { recursive: true });
        writeFileSync(join(root, path), JSON.stringify(document));
    }
    return root;
};

describe('the Java world generation registries', () => {
    const roots: string[] = [];
    afterAll(() => {
        for (const root of roots) rmSync(root, { recursive: true, force: true });
    });

    it('projects a datapack that adds a dimension type and a noise setting', () => {
        const sky = { ultrawarm: false, min_y: 0, height: 256 };
        const root = writeDatapack({
            'data/test/dimension_type/sky.json': sky,
            'data/test/dimension/sky.json': { type: 'test:sky', generator: { type: 'minecraft:flat' } },
            'data/test/worldgen/noise_settings/sky.json': { sea_level: 0 },
            'data/test/worldgen/world_preset/sky.json': { dimensions: {} },
            'data/test/worldgen/flat_level_generator_preset/sky.json': { display: 'minecraft:stone' },
            'data/test/worldgen/multi_noise_biome_source_parameter_list/sky.json': { preset: 'minecraft:overworld' },
            'data/test/tags/block/floor.json': { values: ['minecraft:stone'] },
            'data/test/tags/worldgen/biome/has_sky.json': { values: ['minecraft:plains'] }
        });
        roots.push(root);

        const registries = loadJavaWorldgenRegistriesFrom(
            load([{ kind: 'datapack', path: root }]).definitions,
            join(root, 'no-reports')
        );

        expect(registries.dimensionTypes.get('test:sky')).toEqual(sky);
        expect(registries.dimensions.has('test:sky')).toBe(true);
        expect(registries.noiseSettings.get('test:sky')).toEqual({ sea_level: 0 });
        expect(registries.worldPresets.has('test:sky')).toBe(true);
        expect(registries.flatLevelGeneratorPresets.has('test:sky')).toBe(true);
        expect(registries.multiNoiseParameterLists.has('test:sky')).toBe(true);
        expect(registries.blockTags.get('test:floor')).toMatchObject({ values: ['minecraft:stone'] });
        expect(registries.biomeTags.get('test:has_sky')).toMatchObject({ values: ['minecraft:plains'] });
        // The kind prefix the composite registry keys by never leaks into a generator-facing id.
        expect([...registries.noiseSettings.keys()]).toEqual(['test:sky']);
        expect(registries.biomeParameters.size).toBe(0);
    });

    describe.skipIf(!enabled)('over the fetched vanilla data', { tags: ['real-data'] }, () => {
        const registries = enabled ? loadJavaWorldgenRegistries(sources!) : undefined;

        it('reads the same registries through either entry point', () => {
            const { definitions } = load([{ kind: 'datapack', path: sources!.datapack }]);
            expect(loadJavaWorldgenRegistriesFrom(definitions, sources!.reports)).toEqual(registries);
        });

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

        it('reads the dimension types and the presets that bind them to a generator', () => {
            expect(registries!.dimensionTypes.has('minecraft:the_nether')).toBe(true);
            expect(registries!.worldPresets.get('minecraft:normal')).toMatchObject({
                dimensions: { 'minecraft:overworld': { type: 'minecraft:overworld' } }
            });
            expect(registries!.multiNoiseParameterLists.get('minecraft:overworld')).toEqual({
                preset: 'minecraft:overworld'
            });
            expect(registries!.biomeParameters.has('minecraft:overworld')).toBe(true);
        });

        it('includes the structure types used by the generator', () => {
            const types = new Set(
                [...registries!.structures.values()].map((document) =>
                    typeof document === 'object' && document !== null && 'type' in document ? document.type : undefined
                )
            );

            expect(types.has('minecraft:jigsaw')).toBe(true);
            reportProgress(`Java worldgen data uses ${types.size} structure types.`);
        });
    });
});
