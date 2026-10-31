/**
 * How a name a player typed is matched against the structure identifiers a generator knows.
 *
 * Worth its own tests because the two sides spell structures differently: Bedrock's `/locate
 * structure` names a family, Java's registry has one identifier per variant, and a comparison
 * that is too loose finds the wrong thing while one that is too strict finds nothing.
 */
import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type { Config } from '../config/Config';
import type Server from '../Server';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import { TEST_OVERWORLD_STEM, fakeLevel } from '../testing/level';
import { stub } from '../testing/stub.test.helper';
import type { BiomeSearchRequest, Generator, StructureSearchRequest } from './Generator';
import { World, structureNameMatches } from './World';

/** A world over a generator double that records what it was asked and accepts what it is told. */
const worldOver = (generator: Generator): World => {
    const logger = stub<Logger>({
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        verbose: () => {}
    });
    const server = stub<Server>({
        getLogger: () => logger,
        getConfig: () => stub<Config>({ getEntityTrackingInterval: () => 20 }),
        getContent: () => testContent(),
        getEntityRuntime: () => inertEntityRuntime()
    });

    return new World({
        name: 'search-test',
        path: 'search-test',
        server,
        level: fakeLevel({ server, seed: 99n }),
        stem: TEST_OVERWORLD_STEM,
        generator
    });
};

/** The structures of the village tag the generator double carries. */
const VILLAGES = new Set(['minecraft:village_plains', 'minecraft:village_desert']);

/** The one member the vanilla data pack puts in `#minecraft:eye_of_ender_located`. */
const STRONGHOLD = new Set(['minecraft:stronghold']);

/** A generator double that answers a tag lookup and records the search it is handed. */
const searchingGenerator = () => {
    const asked: { structure?: StructureSearchRequest; biome?: BiomeSearchRequest } = {};
    const generator = stub<Generator>({
        locate: (request) => {
            asked.structure = request;
            return undefined;
        },
        locateBiome: (request) => {
            asked.biome = request;
            return { biome: 'minecraft:plains', x: 32, y: 64, z: 0 };
        },
        membersOfTag: (registry, tag) => {
            if (registry === 'worldgen/structure' && tag === 'minecraft:village') return VILLAGES;
            if (registry === 'worldgen/structure' && tag === 'minecraft:eye_of_ender_located') return STRONGHOLD;
            if (registry === 'worldgen/biome' && tag === 'minecraft:is_ocean') return new Set(['minecraft:ocean']);
            return undefined;
        }
    });
    return { generator, asked };
};

describe('World.locateStructure', () => {
    it("reads a tag the generator carries by its members, with Java's default namespace", () => {
        const { generator, asked } = searchingGenerator();
        worldOver(generator).locateStructure('#village', { x: 10, z: -10 });

        expect(asked.structure?.wanted('minecraft:village_desert')).toBe(true);
        expect(asked.structure?.wanted('minecraft:village_plains')).toBe(true);
        // A member test, not a name match: the tag says which variants count.
        expect(asked.structure?.wanted('minecraft:village_snowy')).toBe(false);
    });

    it("reads the eye of ender's tag by its member, at the item's hundred chunks", () => {
        // The call the item actor port makes for an eye used in the air: Java's
        // `#minecraft:eye_of_ender_located` as written, with `EnderEyeItem.use`'s radius. The
        // tag's member comes from the generator, so nothing in the item path names the stronghold.
        const { generator, asked } = searchingGenerator();
        worldOver(generator).locateStructure('#minecraft:eye_of_ender_located', { x: 10, z: 20 }, 100);

        expect(asked.structure).toMatchObject({ x: 10, z: 20, radius: 100 });
        expect(asked.structure?.wanted('minecraft:stronghold')).toBe(true);
        expect(asked.structure?.wanted('minecraft:village_plains')).toBe(false);
    });

    it('falls back to the name match for a tag the generator does not know', () => {
        const { generator, asked } = searchingGenerator();
        worldOver(generator).locateStructure('#ruinedportal', { x: 0, z: 0 });

        expect(asked.structure?.wanted('minecraft:ruined_portal')).toBe(true);
        expect(asked.structure?.wanted('minecraft:ruined_portal_desert')).toBe(true);
    });

    it("searches Java's hundred regions from the origin's block, with the level's seed", () => {
        const { generator, asked } = searchingGenerator();
        worldOver(generator).locateStructure('stronghold', { x: 10.7, z: -10.2 });

        expect(asked.structure).toMatchObject({ x: 10, z: -10, radius: 100, seed: 99n });
    });
});

describe('World.locateBiome', () => {
    it("walks Java's grid: 6400 blocks out, 32 between columns, 64 between samples", () => {
        const { generator, asked } = searchingGenerator();
        const found = worldOver(generator).locateBiome('plains', { x: 1.5, y: 64.2, z: -3.9 });

        expect(found).toEqual({ biome: 'minecraft:plains', x: 32, y: 64, z: 0 });
        expect(asked.biome).toMatchObject({
            x: 1,
            y: 64,
            z: -3,
            radius: 6400,
            horizontalStep: 32,
            verticalStep: 64,
            seed: 99n
        });
    });

    it('wants exactly the named biome, completing the namespace the way Java does', () => {
        const { generator, asked } = searchingGenerator();
        worldOver(generator).locateBiome('Plains', { x: 0, y: 0, z: 0 });

        expect(asked.biome?.wanted('minecraft:plains')).toBe(true);
        expect(asked.biome?.wanted('minecraft:sunflower_plains')).toBe(false);
    });

    it('wants every member of a biome tag', () => {
        const { generator, asked } = searchingGenerator();
        worldOver(generator).locateBiome('#minecraft:is_ocean', { x: 0, y: 0, z: 0 });

        expect(asked.biome?.wanted('minecraft:ocean')).toBe(true);
        expect(asked.biome?.wanted('minecraft:plains')).toBe(false);
    });

    it('answers nothing on a generator with no biome walk', () => {
        const world = worldOver(stub<Generator>({}));

        expect(world.locateBiome('plains', { x: 0, y: 0, z: 0 })).toBe(undefined);
    });
});

describe('structureNameMatches', () => {
    it('matches the full identifier', () => {
        expect(structureNameMatches('minecraft:village_plains', 'minecraft:village_plains')).toBe(true);
    });

    it('matches the path on its own, which is what a player normally types', () => {
        expect(structureNameMatches('village_plains', 'minecraft:village_plains')).toBe(true);
    });

    it('matches a family name against every variant of it', () => {
        for (const variant of ['plains', 'desert', 'savanna', 'snowy', 'taiga']) {
            expect(structureNameMatches('village', `minecraft:village_${variant}`)).toBe(true);
        }
    });

    it("reads Bedrock's unseparated spelling as Java's separated one", () => {
        expect(structureNameMatches('ruinedportal', 'minecraft:ruined_portal')).toBe(true);
        expect(structureNameMatches('pillageroutpost', 'minecraft:pillager_outpost')).toBe(true);
    });

    it('ignores case on either side', () => {
        expect(structureNameMatches('Village', 'minecraft:VILLAGE_PLAINS')).toBe(true);
    });

    it('takes a tag reference as the name inside it', () => {
        expect(structureNameMatches('#village', 'minecraft:village_plains')).toBe(true);
    });

    it('stops a family name at a variant boundary rather than anywhere in the path', () => {
        // `ruin` is a prefix of `ruined_portal`'s first part, not a part of its own.
        expect(structureNameMatches('ruin', 'minecraft:ruined_portal')).toBe(false);
        expect(structureNameMatches('vil', 'minecraft:village_plains')).toBe(false);
    });

    it('does not match an unrelated structure', () => {
        expect(structureNameMatches('village', 'minecraft:ocean_monument')).toBe(false);
        expect(structureNameMatches('fortress', 'minecraft:village_plains')).toBe(false);
    });

    it('does not let a later part of a path stand in for the whole name', () => {
        // Otherwise `/locate structure portal` would answer with a ruined portal, and
        // `/locate structure monument` with an ocean one.
        expect(structureNameMatches('portal', 'minecraft:ruined_portal')).toBe(false);
        expect(structureNameMatches('monument', 'minecraft:ocean_monument')).toBe(false);
    });
});
