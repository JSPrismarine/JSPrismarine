import { describe, expect, it } from 'vitest';

import type { JavaWorldgenRegistries } from './javaWorldgenData';
import { findJavaWorldgenSources } from './javaWorldgenSources';
import { loadJavaWorldgenRegistries } from './javaWorldgenData';
import { buildRegistryBundle, readRegistryBundle, shareRegistryBundle } from './registryBundle';
import { RegistryBundleFormatError } from '@jsprismarine/errors/prismarine/generation';

const sources = findJavaWorldgenSources();

/** A registry set with one document in each, for the cases that do not need the real data. */
const tiny = (): JavaWorldgenRegistries => ({
    densityFunctions: new Map([['minecraft:zero', { type: 'minecraft:constant', argument: 0 }]]),
    noises: new Map([['minecraft:offset', { firstOctave: -3, amplitudes: [1, 1, 1] }]]),
    noiseSettings: new Map([['minecraft:overworld', { sea_level: 63 }]]),
    materialRules: new Map(),
    materialConditions: new Map(),
    carvers: new Map([['minecraft:cave', { type: 'minecraft:cave' }]]),
    biomes: new Map([['minecraft:plains', { temperature: 0.8, downfall: 0.4, features: [[], []] }]]),
    features: new Map(),
    placedFeatures: new Map(),
    blockStateProviders: new Map(),
    processorLists: new Map(),
    structures: new Map(),
    structureSets: new Map(),
    templatePools: new Map(),
    dimensionTypes: new Map([['minecraft:overworld', { min_y: -64, height: 384 }]]),
    dimensions: new Map(),
    worldPresets: new Map([['minecraft:normal', { dimensions: {} }]]),
    flatLevelGeneratorPresets: new Map(),
    multiNoiseParameterLists: new Map([['minecraft:overworld', { preset: 'minecraft:overworld' }]]),
    blockTags: new Map([['minecraft:leaves', { values: ['minecraft:oak_leaves', '#minecraft:wart_blocks'] }]]),
    biomeTags: new Map(),
    structureTags: new Map(),
    biomeParameters: new Map([
        [
            'minecraft:overworld',
            { biomes: [{ biome: 'minecraft:plains', parameters: { temperature: { min: 0, max: 1 } } }] }
        ]
    ])
});

/** The registry fields: every field but the data pack `format`, which is a number. */
type RegistryName = Exclude<keyof JavaWorldgenRegistries, 'format' | 'release'>;

const registryNames = (registries: JavaWorldgenRegistries): RegistryName[] =>
    Object.keys(registries).filter(
        (name): name is RegistryName => name !== 'format' && name !== 'release' && name in registries
    );

describe('the world generation registry bundle', () => {
    it('reads back every document it was given, and reads a shared buffer the same way', () => {
        const registries = tiny();

        for (const bundle of [buildRegistryBundle(registries), shareRegistryBundle(registries)]) {
            const read = readRegistryBundle(bundle);
            for (const name of registryNames(registries)) {
                expect([...read[name]], name).toEqual([...registries[name]]);
            }
        }
    });

    it('carries the data pack format, so a worker parses with the same grammar', () => {
        expect(readRegistryBundle(buildRegistryBundle({ ...tiny(), format: 128 })).format).toBe(128);
        expect(readRegistryBundle(buildRegistryBundle(tiny())).format).toBeUndefined();
    });

    it("carries the Java release, so a worker reads the same release's structure templates", () => {
        expect(readRegistryBundle(buildRegistryBundle({ ...tiny(), release: '26.4-snapshot-10' })).release).toBe(
            '26.4-snapshot-10'
        );
        expect(readRegistryBundle(buildRegistryBundle(tiny())).release).toBeUndefined();
    });

    it('skips raw climate reports when matching shared tables are available', () => {
        const read = readRegistryBundle(
            buildRegistryBundle(tiny()),
            new Map([['minecraft:overworld', new SharedArrayBuffer(0)]])
        );

        expect(read.biomeParameters).toEqual(new Map());
        expect(read.biomes).toEqual(tiny().biomes);
    });

    it('keeps raw climate reports when the shared table set is incomplete', () => {
        const registries = tiny();
        const read = readRegistryBundle(buildRegistryBundle(registries), new Map());

        expect(read.biomeParameters).toEqual(registries.biomeParameters);
    });

    it('carries a document whose text is not plain ASCII', () => {
        const registries = { ...tiny(), structures: new Map([['minecraft:village', { name: 'Dorf über — é' }]]) };

        expect(readRegistryBundle(buildRegistryBundle(registries)).structures.get('minecraft:village')).toEqual({
            name: 'Dorf über — é'
        });
    });

    it('refuses a buffer that is not a bundle', () => {
        expect(() => readRegistryBundle(new ArrayBuffer(4))).toThrow(RegistryBundleFormatError);
        expect(() => readRegistryBundle(new ArrayBuffer(64))).toThrow(RegistryBundleFormatError);
    });

    it('refuses a bundle written by another format version', () => {
        const bundle = buildRegistryBundle(tiny());
        new DataView(bundle).setUint32(4, 99, true);

        expect(() => readRegistryBundle(bundle)).toThrow(/format version 99/);
    });

    it.skipIf(sources === undefined)(
        'is the registries the loader reads off disk, document for document',
        { tags: ['real-data'] },
        () => {
            const registries = loadJavaWorldgenRegistries(sources!);
            const read = readRegistryBundle(buildRegistryBundle(registries));

            for (const name of registryNames(registries)) {
                expect([...read[name].keys()], name).toEqual([...registries[name].keys()]);
                for (const [id, document] of registries[name]) {
                    expect(read[name].get(id), `${name} ${id}`).toEqual(document);
                }
            }
        }
    );
});
