/**
 * The optional `FeatureWorld` hooks, run through the vanilla features that need them.
 *
 * Each test builds a region, runs one real feature into it and reads back what the region kept,
 * because the thing worth checking is that a generated chest, spawner, gateway or crystal
 * survives the trip from `@jsprismarine/features` into a chunk, not that the hook was called.
 */
import { WorldgenRandom, bonusChest, endGateway, endSpike, monsterRoom } from '@jsprismarine/features';
import type { HeightmapType } from '@jsprismarine/features';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { GenerationRegion } from './GenerationRegion';
import { createJavaBlockOracle } from './javaBlockOracle';
import { createBlockEntity, createEntitySpawn } from './javaGeneratedContent';

const STONE = { name: 'minecraft:stone', properties: {} };
const AIR = { name: 'minecraft:air', properties: {} };
const CAVE_AIR = 'minecraft:cave_air';
const HEIGHTMAPS = [
    'WORLD_SURFACE_WG',
    'WORLD_SURFACE',
    'OCEAN_FLOOR_WG',
    'OCEAN_FLOOR',
    'MOTION_BLOCKING',
    'MOTION_BLOCKING_NO_LEAVES'
] as const satisfies readonly HeightmapType[];

const SEED = 1234n;

/** A region with no block tags, which is all these features read the oracle for. */
const region = (): GenerationRegion =>
    new GenerationRegion({
        chunkX: 0,
        chunkZ: 0,
        minY: -64,
        height: 384,
        seaLevel: 63,
        seed: SEED,
        blocks: createJavaBlockOracle(new Map()),
        biomeAt: () => 'minecraft:plains'
    });

const terrainTile = (chunkX: number, chunkZ: number): GenerationRegion =>
    new GenerationRegion({
        chunkX,
        chunkZ,
        minY: -64,
        height: 384,
        radius: 0,
        seaLevel: 63,
        seed: SEED,
        blocks: createJavaBlockOracle(new Map()),
        biomeAt: () => 'minecraft:plains'
    });

const featureRegionOptions = () => ({
    chunkX: 0,
    chunkZ: 0,
    minY: -64,
    height: 384,
    radius: 1,
    seaLevel: 63,
    seed: SEED,
    blocks: createJavaBlockOracle(new Map()),
    biomeAt: () => 'minecraft:plains'
});

/** Nine deterministic terrain tiles, as a feature worker receives them. */
const featureTerrainTiles = (): GenerationRegion[] => {
    const tiles: GenerationRegion[] = [];
    for (let chunkX = -1; chunkX <= 1; chunkX++) {
        for (let chunkZ = -1; chunkZ <= 1; chunkZ++) {
            const tile = terrainTile(chunkX, chunkZ);
            for (let localX = 0; localX < 16; localX++) {
                for (let localZ = 0; localZ < 16; localZ++) {
                    const x = chunkX * 16 + localX;
                    const z = chunkZ * 16 + localZ;
                    const top = 40 + ((x * 17 + z * 31) & 7);
                    tile.writeName(x, top, z, (x + z) % 3 === 0 ? 'minecraft:dirt' : 'minecraft:stone');
                }
            }
            tile.featureWorld().setBlockEntity?.({ x: chunkX * 16, y: 50, z: chunkZ * 16 }, { id: 'minecraft:chest' });
            tile.spawnEntityAt('minecraft:end_crystal', chunkX * 16 + 0.5, 52, chunkZ * 16 + 0.5, 0);
            tile.freezeSurfaceHeights();
            tiles.push(tile);
        }
    }
    return tiles;
};

/** A neighbor's three by three feature view, centered on its own chunk and reaching into chunk 0. */
const featureView = (chunkX: number, chunkZ: number): GenerationRegion =>
    new GenerationRegion({
        chunkX,
        chunkZ,
        minY: -64,
        height: 384,
        seaLevel: 63,
        seed: SEED,
        blocks: createJavaBlockOracle(new Map()),
        biomeAt: () => 'minecraft:plains'
    });

/** Fills the whole three by three chunk window with stone up to `top`. */
const fillStone = (built: GenerationRegion, top: number): void => {
    for (let x = -16; x < 32; x++) {
        for (let z = -16; z < 32; z++) {
            for (let y = top - 24; y <= top; y++) built.write(x, y, z, STONE);
        }
    }
};

const scanHeight = (
    built: GenerationRegion,
    blocks: ReturnType<typeof createJavaBlockOracle>,
    type: HeightmapType
): number => {
    for (let y = built.maxY; y >= built.minY; y--) {
        const state = built.stateAt(0, y, 0);
        const matches = (() => {
            switch (type) {
                case 'WORLD_SURFACE':
                case 'WORLD_SURFACE_WG':
                    return !blocks.isAir(state);
                case 'OCEAN_FLOOR':
                case 'OCEAN_FLOOR_WG':
                    return blocks.isSolid(state);
                case 'MOTION_BLOCKING':
                    return blocks.isSolid(state) || blocks.fluid(state) !== 'empty';
                case 'MOTION_BLOCKING_NO_LEAVES':
                    return (
                        (blocks.isSolid(state) || blocks.fluid(state) !== 'empty') &&
                        !blocks.hasTag(state, 'minecraft:leaves')
                    );
            }
        })();
        if (matches) return y + 1;
    }
    return built.minY;
};

describe('setBlockEntity', () => {
    it('gives a generated bonus chest the loot table it fills from', () => {
        const built = region();
        fillStone(built, 63);

        expect(bonusChest().place(built.featureWorld(), new WorldgenRandom(SEED), { x: 8, y: 64, z: 8 })).toBe(true);

        const placed = built.centerBlockEntities();
        expect(placed).toHaveLength(1);
        expect(placed[0]?.request).toEqual({
            id: 'minecraft:chest',
            lootTable: 'minecraft:chests/spawn_bonus_chest'
        });
        expect(built.stateAt(placed[0]!.x, placed[0]!.y, placed[0]!.z).name).toBe('minecraft:chest');

        const chest = createBlockEntity(placed[0]!, SEED);
        expect(chest?.getId()).toBe('Chest');
        const nbt = chest!.toNBT();
        expect(nbt.getString('LootTable', '')).toBe('loot_tables/chests/spawn_bonus_chest.json');
        expect(nbt.getNumber('LootTableSeed', 0)).not.toBe(0);
        expect(nbt.getNumber('x', -1)).toBe(placed[0]!.x);
    });

    it('gives a dungeon spawner the mob it spawns, named the way Bedrock names it', () => {
        const built = region();
        fillStone(built, 50);
        // Java needs one to five two-block gaps in the room's wall. The two columns cover both
        // room widths the feature draws, and only ever one of them lands on a wall.
        for (const x of [4, 5]) for (const y of [40, 41]) built.write(x, y, 8, AIR);

        expect(monsterRoom().place(built.featureWorld(), new WorldgenRandom(SEED), { x: 8, y: 40, z: 8 })).toBe(true);

        const spawner = built.centerBlockEntities().find((entry) => entry.request.id === 'minecraft:mob_spawner');
        expect(spawner).toBeDefined();
        expect(built.stateAt(spawner!.x, spawner!.y, spawner!.z).name).toBe('minecraft:spawner');

        const blockEntity = createBlockEntity(spawner!, SEED);
        expect(blockEntity?.getId()).toBe('MobSpawner');
        expect(blockEntity!.toNBT().getString('EntityIdentifier', '')).toMatch(/^minecraft:(skeleton|zombie|spider)$/);
    });

    it('gives an end gateway the portal it sends a traveler to', () => {
        const built = region();
        const exit = { x: 100, y: 50, z: 100 };

        expect(
            endGateway(exit, true).place(built.featureWorld(), new WorldgenRandom(SEED), { x: 8, y: 70, z: 8 })
        ).toBe(true);

        const placed = built.centerBlockEntities();
        expect(placed).toHaveLength(1);

        const gateway = createBlockEntity(placed[0]!, SEED);
        expect(gateway?.getId()).toBe('EndGateway');
        const portal = gateway!.toNBT().getCompound('ExitPortal', false);
        expect(portal?.getNumber('X', 0)).toBe(100);
        expect(portal?.getNumber('Y', 0)).toBe(50);
        expect(portal?.getNumber('Z', 0)).toBe(100);
    });

    it('drops a block entity when a later write takes its block away', () => {
        const built = region();
        fillStone(built, 63);
        bonusChest().place(built.featureWorld(), new WorldgenRandom(SEED), { x: 8, y: 64, z: 8 });

        const placed = built.centerBlockEntities()[0]!;
        built.write(placed.x, placed.y, placed.z, STONE);

        expect(built.centerBlockEntities()).toHaveLength(0);
    });

    it('keeps nothing for a position outside the region', () => {
        const built = region();
        built.featureWorld().setBlockEntity?.({ x: 500, y: 64, z: 500 }, { id: 'minecraft:chest' });

        expect(built.centerBlockEntities()).toHaveLength(0);
    });
});

describe('spawnEntity', () => {
    it('records the end spike crystal in the middle of its block', () => {
        const built = region();
        const spikes = [{ centerX: 8, centerZ: 8, radius: 2, height: 70, guarded: false }];

        expect(
            endSpike(spikes, true, undefined).place(built.featureWorld(), new WorldgenRandom(SEED), {
                x: 8,
                y: 0,
                z: 8
            })
        ).toBe(true);

        const spawns = built.centerEntitySpawns();
        expect(spawns).toHaveLength(1);
        expect(spawns[0]).toMatchObject({ type: 'minecraft:end_crystal', x: 8.5, y: 71, z: 8.5 });
        expect(spawns[0]!.yaw).toBeGreaterThanOrEqual(0);
        expect(spawns[0]!.yaw).toBeLessThan(360);

        // Bedrock still calls it the ender crystal, which is the name an entity class answers to.
        expect(createEntitySpawn(spawns[0]!)).toMatchObject({ type: 'minecraft:ender_crystal', x: 8.5, z: 8.5 });
    });

    it('keeps the crystal options the spike configuration asked for', () => {
        const built = region();
        const spikes = [{ centerX: 8, centerZ: 8, radius: 2, height: 70, guarded: false }];

        // The respawn animation's configuration: invulnerable crystals beaming at the podium.
        endSpike(spikes, true, { x: 0, y: 128, z: 0 }).place(built.featureWorld(), new WorldgenRandom(SEED), {
            x: 8,
            y: 0,
            z: 8
        });

        const spawns = built.centerEntitySpawns();
        expect(spawns[0]).toMatchObject({ beamTarget: { x: 0, y: 128, z: 0 }, invulnerable: true });
        expect(spawns[0]!.showBottom).toBeUndefined();
        expect(createEntitySpawn(spawns[0]!)).toMatchObject({
            beamTarget: { x: 0, y: 128, z: 0 },
            invulnerable: true
        });
    });

    it('records worldgen crystals vulnerable, with no beam and the default base plate', () => {
        const built = region();
        const spikes = [{ centerX: 8, centerZ: 8, radius: 2, height: 70, guarded: false }];

        endSpike(spikes, false, undefined).place(built.featureWorld(), new WorldgenRandom(SEED), {
            x: 8,
            y: 0,
            z: 8
        });

        const spawns = built.centerEntitySpawns();
        expect(spawns[0]!.invulnerable).toBe(false);
        expect(spawns[0]!.beamTarget).toBeUndefined();
        expect(spawns[0]!.showBottom).toBeUndefined();
    });

    it('keeps nothing for a position outside the region', () => {
        const built = region();
        built.featureWorld().spawnEntity?.('minecraft:end_crystal', { x: 500, y: 64, z: 500 }, { yaw: 0 });

        expect(built.centerEntitySpawns()).toHaveLength(0);
    });
});

describe('neighbor chunk data', () => {
    it('indexes all neighboring tiles by chunk coordinates and honors sparse overrides', () => {
        const centerChunkX = -1;
        const centerChunkZ = -2;
        const blockNames = [
            'minecraft:stone',
            'minecraft:dirt',
            'minecraft:gravel',
            'minecraft:deepslate',
            'minecraft:cobblestone',
            'minecraft:netherrack',
            'minecraft:sand',
            'minecraft:clay',
            'minecraft:moss_block'
        ];
        const tiles: GenerationRegion[] = [];
        const expected: { readonly x: number; readonly z: number; readonly name: string }[] = [];
        let tileIndex = 0;

        for (let relativeX = -1; relativeX <= 1; relativeX++) {
            for (let relativeZ = -1; relativeZ <= 1; relativeZ++) {
                const chunkX = centerChunkX + relativeX;
                const chunkZ = centerChunkZ + relativeZ;
                const name = blockNames[tileIndex++]!;
                const tile = terrainTile(chunkX, chunkZ);
                const x = chunkX * 16 + 15;
                const z = chunkZ * 16 + 15;
                tile.writeName(x, 50, z, name);
                tiles.push(tile);
                expected.push({ x, z, name });
            }
        }

        const viewed = GenerationRegion.featureView(
            { ...featureRegionOptions(), chunkX: centerChunkX, chunkZ: centerChunkZ },
            tiles.reverse()
        );
        for (const { x, z, name } of expected) {
            expect(viewed.stateAt(x, 50, z).name).toBe(name);
        }

        viewed.writeName(-1, 50, -17, 'minecraft:gold_block');
        expect(viewed.stateAt(-1, 50, -17).name).toBe('minecraft:gold_block');
        expect(tiles[4]?.stateAt(-1, 50, -17).name).toBe('minecraft:cobblestone');
    });

    it('copies neighboring terrain into the feature view', () => {
        const source = terrainTile(1, 0);
        source.writeName(16, 50, 8, 'minecraft:stone');
        source.freezeSurfaceHeights();

        const built = region();
        built.copyCenterFrom(source);

        expect(built.featureWorld().getBlock({ x: 16, y: 50, z: 8 }).name).toBe('minecraft:stone');
        expect(built.featureWorld().getHeight('WORLD_SURFACE_WG', 16, 8)).toBe(51);
    });

    it('reads immutable terrain tiles without changing feature output or allocating a copied view', () => {
        const tiles = featureTerrainTiles();
        const copied = new GenerationRegion(featureRegionOptions());
        for (const tile of tiles) copied.copyCenterFrom(tile);
        const viewed = GenerationRegion.featureView(featureRegionOptions(), tiles);

        expect(Reflect.get(viewed, 'states')).toHaveProperty('byteLength', 0);
        for (const x of [-16, -1, 0, 15, 16, 31]) {
            for (const z of [-16, -1, 0, 15, 16, 31]) {
                for (const y of [39, 40, 43, 47, 51]) {
                    expect(viewed.stateAt(x, y, z)).toEqual(copied.stateAt(x, y, z));
                }
                expect(viewed.featureWorld().getHeight('WORLD_SURFACE', x, z)).toBe(
                    copied.featureWorld().getHeight('WORLD_SURFACE', x, z)
                );
                expect(viewed.featureWorld().getHeight('WORLD_SURFACE_WG', x, z)).toBe(
                    copied.featureWorld().getHeight('WORLD_SURFACE_WG', x, z)
                );
            }
        }
        expect(viewed.centerBlockEntities()).toEqual(copied.centerBlockEntities());
        expect(viewed.centerEntitySpawns()).toEqual(copied.centerEntitySpawns());

        copied.beginWriteTracking();
        viewed.beginWriteTracking();
        for (const [x, z, block] of [
            [-1, 0, 'minecraft:gold_block'],
            [16, 3, 'minecraft:oak_log'],
            [0, 0, 'minecraft:air']
        ] as const) {
            copied.writeName(x, 60, z, block);
            viewed.writeName(x, 60, z, block);
        }

        expect(viewed.takeTrackedPatches()).toEqual(copied.takeTrackedPatches());
        expect(tiles[4]?.stateAt(0, 60, 0).name).toBe('minecraft:air');
        expect(tiles[3]?.stateAt(-1, 60, 0).name).toBe('minecraft:air');
    });

    it('accepts terrain tiles in any arrival order without changing what positions they cover', () => {
        const tiles = featureTerrainTiles();
        const forward = GenerationRegion.featureView(featureRegionOptions(), tiles);
        const reversed = GenerationRegion.featureView(featureRegionOptions(), [...tiles].reverse());

        for (const [x, z] of [
            [-16, -16],
            [0, 0],
            [15, 15],
            [16, 16],
            [31, 31]
        ]) {
            for (const y of [39, 40, 44, 47, 51]) {
                expect(reversed.stateAt(x!, y, z!)).toEqual(forward.stateAt(x!, y, z!));
            }
        }
    });

    it('keeps overlapping feature tasks isolated across worker counts and task order', async () => {
        const tiles = featureTerrainTiles();
        const runTasks = async (workerCount: number, order: readonly number[]): Promise<readonly string[]> => {
            const results = new Array<string>(order.length);
            let next = 0;
            await Promise.all(
                Array.from({ length: workerCount }, async () => {
                    while (next < order.length) {
                        const task = order[next++]!;
                        const view = GenerationRegion.featureView(featureRegionOptions(), tiles);
                        view.beginWriteTracking();
                        await Promise.resolve();
                        view.writeName(0, 40, 0, task % 2 === 0 ? 'minecraft:gold_block' : 'minecraft:diamond_block');
                        view.writeName(16, 40, 0, task % 3 === 0 ? 'minecraft:oak_log' : 'minecraft:birch_log');
                        results[task] = createHash('sha256')
                            .update(JSON.stringify(view.takeTrackedPatches()))
                            .digest('hex');
                    }
                })
            );
            return results;
        };
        const order = Array.from({ length: 8 }, (_unused, index) => index);
        const reversed = [...order].reverse();

        const serial = await runTasks(1, order);
        const parallel = await runTasks(4, reversed);

        expect(parallel).toEqual(serial);
        expect(tiles[4]?.stateAt(0, 40, 0).name).toBe('minecraft:dirt');
        expect(tiles[7]?.stateAt(16, 40, 0).name).toBe('minecraft:stone');
    });

    it('leaves an existing block when a copied palette slot resolves to Java air', () => {
        const source = terrainTile(1, 0);
        source.writeName(16, 51, 8, 'minecraft:stone');
        source.writeBedrock(16, 50, 8, { name: 'minecraft:air', states: {} });

        const built = region();
        built.writeName(16, 50, 8, 'minecraft:gold_block');
        built.copyCenterFrom(source);

        expect(built.stateAt(16, 50, 8).name).toBe('minecraft:gold_block');
        expect(built.stateAt(16, 51, 8).name).toBe('minecraft:stone');
        expect(built.transfer().payload.palette.some((block) => block.bedrock?.name === 'minecraft:air')).toBe(true);
    });

    it('returns cross-chunk blocks, block entities, and entity spawns as a patch', () => {
        const built = region();
        const world = built.featureWorld();
        built.beginWriteTracking();
        world.setBlock({ x: 16, y: 64, z: 8 }, { name: 'minecraft:chest', properties: {} });
        world.setBlockEntity?.({ x: 16, y: 64, z: 8 }, { id: 'minecraft:chest' });
        world.spawnEntity?.('minecraft:end_crystal', { x: 16, y: 65, z: 8 }, { yaw: 90, invulnerable: false });

        const [patch] = built.takeTrackedPatches();
        if (patch === undefined) throw new Error('Cross-chunk writes did not produce a patch');
        expect(patch).toMatchObject({ chunkX: 1, chunkZ: 0 });
        expect(patch?.blocks).toHaveLength(1);
        expect(patch?.blockEntities).toHaveLength(1);
        expect(patch?.entitySpawns).toHaveLength(1);
        expect(patch?.entitySpawns[0]).toMatchObject({ yaw: 90, invulnerable: false });

        const destination = terrainTile(1, 0);
        destination.applyPatch(patch);
        expect(destination.stateAt(16, 64, 8).name).toBe('minecraft:chest');
        expect(destination.centerBlockEntities()).toHaveLength(1);
        expect(destination.centerEntitySpawns()).toHaveLength(1);
    });

    it('does not let a patch drop grass or leaf litter over a block it never saw', () => {
        const position = { x: 16, y: 64, z: 8 };
        const built = terrainTile(1, 0);
        built.beginWriteTracking();
        const builtWorld = built.featureWorld();
        builtWorld.setBlock(position, { name: 'minecraft:leaf_litter', properties: {} });
        builtWorld.setBlock({ ...position, y: 65 }, { name: 'minecraft:air', properties: {} });
        const [patch] = built.takeTrackedPatches();
        if (patch === undefined) throw new Error('The writes did not produce a patch');

        // Another chunk's tree stands here, which the patch was drawn without.
        const destination = terrainTile(1, 0);
        destination.featureWorld().setBlock(position, { name: 'minecraft:oak_log', properties: { axis: 'y' } });
        destination.featureWorld().setBlock({ ...position, y: 65 }, { name: 'minecraft:oak_log', properties: {} });
        destination.applyPatch(patch);

        expect(destination.stateAt(position.x, position.y, position.z).name).toBe('minecraft:oak_log');
        // Air is a carve, not ground cover, and still goes through.
        expect(destination.stateAt(position.x, 65, position.z).name).toBe('minecraft:air');
    });

    it('returns block entity removals in patches', () => {
        const position = { x: 16, y: 64, z: 8 };
        const built = terrainTile(1, 0);
        const builtWorld = built.featureWorld();
        builtWorld.setBlock(position, { name: 'minecraft:chest', properties: {} });
        builtWorld.setBlockEntity?.(position, { id: 'minecraft:chest' });

        built.beginWriteTracking();
        builtWorld.setBlock(position, { name: 'minecraft:stone', properties: {} });

        const [patch] = built.takeTrackedPatches();
        if (patch === undefined) throw new Error('Overwriting a block entity did not produce a patch');
        expect(patch.blockEntityRemovals).toEqual([position]);

        const destination = terrainTile(1, 0);
        const destinationWorld = destination.featureWorld();
        destinationWorld.setBlock(position, { name: 'minecraft:chest', properties: {} });
        destinationWorld.setBlockEntity?.(position, { id: 'minecraft:chest' });
        destination.applyPatch(patch);
        expect(destination.centerBlockEntities()).toHaveLength(0);
    });
});

describe('heightmap cache', () => {
    const blocks = createJavaBlockOracle(new Map([['minecraft:leaves', { values: ['minecraft:oak_leaves'] }]]));

    const assertMatchesScan = (built: GenerationRegion): void => {
        const world = built.featureWorld();
        for (const type of HEIGHTMAPS) {
            expect(world.getHeight(type, 0, 0)).toBe(scanHeight(built, blocks, type));
        }
    };

    it('invalidates all heightmaps after ordinary writes', () => {
        const built = new GenerationRegion({ ...featureRegionOptions(), blocks });

        built.writeName(0, 10, 0, 'minecraft:stone');
        built.writeName(0, 18, 0, 'minecraft:water');
        built.writeName(0, 25, 0, 'minecraft:oak_leaves');
        assertMatchesScan(built);
        expect(built.featureWorld().getHeight('WORLD_SURFACE', 0, 0)).toBe(26);

        built.writeName(0, 25, 0, 'minecraft:air');
        assertMatchesScan(built);
        expect(built.featureWorld().getHeight('WORLD_SURFACE', 0, 0)).toBe(19);

        built.writeName(0, 30, 0, 'minecraft:dirt');
        assertMatchesScan(built);
        built.writeName(0, 30, 0, 'minecraft:air');
        assertMatchesScan(built);
    });

    it('invalidates cached columns copied directly from a terrain tile', () => {
        const built = new GenerationRegion({ ...featureRegionOptions(), blocks });
        const source = new GenerationRegion({
            ...featureRegionOptions(),
            chunkX: 0,
            chunkZ: 0,
            radius: 0,
            blocks
        });

        built.writeName(0, 10, 0, 'minecraft:stone');
        assertMatchesScan(built);
        source.writeName(0, 40, 0, 'minecraft:stone');
        source.writeName(0, 50, 0, 'minecraft:water');
        built.copyCenterFrom(source);

        assertMatchesScan(built);
        expect(built.featureWorld().getHeight('WORLD_SURFACE', 0, 0)).toBe(51);
        expect(built.featureWorld().getHeight('OCEAN_FLOOR', 0, 0)).toBe(41);
    });
});

describe('structure writes', () => {
    const NETHER_BRICKS = { name: 'minecraft:nether_bricks', properties: {} };
    const QUARTZ_ORE = { name: 'minecraft:nether_quartz_ore', properties: {} };

    it('marks what a structure piece wrote and carries the marks in its chunk\u2019s patch', () => {
        const built = region();
        built.beginWriteTracking();
        built.withStructureWrites(() => {
            built.write(4, 64, 4, NETHER_BRICKS);
            built.write(4, 65, 4, AIR);
        });
        built.write(5, 64, 4, STONE);

        const [patch] = built.takeTrackedPatches();
        if (patch === undefined) throw new Error('The writes did not produce a patch');
        expect(patch.blocks).toHaveLength(3);
        // The carved air counts too: a corridor is as much the structure's as its walls.
        expect(patch.structureBlocks).toEqual([
            { x: 4, y: 64, z: 4 },
            { x: 4, y: 65, z: 4 }
        ]);
    });

    it('lets a feature of the same pass take a mark away, as it saw the structure\u2019s block', () => {
        const built = region();
        built.beginWriteTracking();
        built.withStructureWrites(() => built.write(4, 64, 4, NETHER_BRICKS));
        built.write(4, 64, 4, STONE);

        const [patch] = built.takeTrackedPatches();
        expect(patch?.structureBlocks).toEqual([]);
    });

    it('keeps a structure\u2019s blocks against a neighbor\u2019s patch at the merge', () => {
        // The fortress wall, written by this chunk's own pass.
        const own = region();
        own.beginWriteTracking();
        own.withStructureWrites(() => {
            own.write(4, 64, 4, NETHER_BRICKS);
            own.write(4, 65, 4, AIR);
        });
        const [ownPatch] = own.takeTrackedPatches();
        if (ownPatch === undefined) throw new Error('The structure did not produce a patch');

        // The neighbor's quartz vein, decided against bare netherrack it saw where the wall is.
        const neighbor = featureView(1, 0);
        neighbor.beginWriteTracking();
        neighbor.write(4, 64, 4, QUARTZ_ORE);
        neighbor.write(4, 65, 4, QUARTZ_ORE);
        neighbor.write(5, 64, 4, QUARTZ_ORE);
        const [inbound] = neighbor.takeTrackedPatches();
        if (inbound === undefined) throw new Error('The vein did not produce a patch');

        const final = terrainTile(0, 0);
        final.applyPatch(ownPatch);
        final.applyPatch(inbound, { keep: ownPatch.structureBlocks });

        expect(final.stateAt(4, 64, 4).name).toBe('minecraft:nether_bricks');
        expect(final.stateAt(4, 65, 4).name).toBe('minecraft:air');
        // Beside the wall the vein lands as it would have.
        expect(final.stateAt(5, 64, 4).name).toBe('minecraft:nether_quartz_ore');
    });

    it('keeps a structure\u2019s block entity against a neighbor\u2019s write over it', () => {
        const own = region();
        own.beginWriteTracking();
        own.withStructureWrites(() => {
            own.write(4, 64, 4, { name: 'minecraft:chest', properties: {} });
            own.featureWorld().setBlockEntity?.({ x: 4, y: 64, z: 4 }, { id: 'minecraft:chest' });
        });
        const [ownPatch] = own.takeTrackedPatches();
        if (ownPatch === undefined) throw new Error('The structure did not produce a patch');

        const neighbor = featureView(1, 0);
        const neighborWorld = neighbor.featureWorld();
        neighborWorld.setBlock({ x: 4, y: 64, z: 4 }, { name: 'minecraft:chest', properties: {} });
        neighborWorld.setBlockEntity?.({ x: 4, y: 64, z: 4 }, { id: 'minecraft:chest' });
        neighbor.beginWriteTracking();
        neighborWorld.setBlock({ x: 4, y: 64, z: 4 }, STONE);
        const [inbound] = neighbor.takeTrackedPatches();
        if (inbound === undefined) throw new Error('The overwrite did not produce a patch');
        expect(inbound.blockEntityRemovals).toHaveLength(1);

        const final = terrainTile(0, 0);
        final.applyPatch(ownPatch);
        final.applyPatch(inbound, { keep: ownPatch.structureBlocks });

        expect(final.stateAt(4, 64, 4).name).toBe('minecraft:chest');
        expect(final.centerBlockEntities()).toHaveLength(1);
    });
});

describe('centerBlockSlots', () => {
    it('treats cave air as air when tracking a column ceiling', () => {
        const built = terrainTile(0, 0);
        built.writeName(0, -62, 0, STONE.name);
        built.writeName(0, -61, 0, CAVE_AIR);
        built.writeName(0, -60, 0, STONE.name);
        built.writeName(0, -60, 0, CAVE_AIR);

        expect(built.centerBlockSlots().columnTops[0]).toBe(-62);
    });

    it('omits cave air from the non-air center-block walk', () => {
        const built = terrainTile(0, 0);
        built.writeName(0, -62, 0, CAVE_AIR);
        built.writeName(0, -61, 0, STONE.name);

        const visited: string[] = [];
        built.forEachCenterBlock((_localX, y, _localZ, block) => {
            if (y >= -62 && y <= -61) visited.push(block.java.name);
        });

        expect(visited).toEqual([STONE.name]);
    });

    it('hands over the same blocks the per-block walk visits, whatever the radius', () => {
        const featureView = new GenerationRegion({
            chunkX: 1,
            chunkZ: -2,
            minY: -64,
            height: 384,
            radius: 1,
            seaLevel: 63,
            seed: SEED,
            blocks: createJavaBlockOracle(new Map()),
            biomeAt: () => 'minecraft:plains'
        });

        for (const built of [terrainTile(1, -2), featureView]) {
            built.write(16, 64, -32, STONE);
            built.write(31, -64, -17, { name: 'minecraft:bedrock', properties: {} });
            built.writeBedrock(20, 70, -20, { name: 'minecraft:bone_block', states: { pillar_axis: 'y' } });

            const walked = new Map<string, string>();
            built.forEachCenterBlock((localX, y, localZ, block) => {
                walked.set(`${localX},${y},${localZ}`, block.bedrock?.name ?? block.java.name);
            });

            const { palette, slots, columnTops } = built.centerBlockSlots();
            const handed = new Map<string, string>();
            for (let localX = 0; localX < 16; localX++) {
                for (let localZ = 0; localZ < 16; localZ++) {
                    const column = localX * 16 + localZ;
                    for (let y = built.minY; y <= columnTops[column]!; y++) {
                        const entry = palette[slots[column * 384 + (y - built.minY)]!]!;
                        if (entry.java.name === AIR.name) continue;
                        handed.set(`${localX},${y},${localZ}`, entry.bedrock?.name ?? entry.java.name);
                    }
                }
            }

            expect(handed.size).toBeGreaterThan(0);
            expect([...handed].sort()).toEqual([...walked].sort());
        }
    });
});

describe('terrain name writer', () => {
    it('keeps terrain blocks and column heights visible to the later feature pass', () => {
        const baseline = terrainTile(0, 0);
        const fast = terrainTile(0, 0);
        const writeFast = fast.createTerrainNameWriter();
        const writes = [
            [0, -62, 0, 'minecraft:stone'],
            [0, -60, 0, 'minecraft:dirt'],
            [0, -60, 0, 'minecraft:air'],
            [0, -61, 0, 'minecraft:grass_block'],
            [1, -50, 0, 'minecraft:cobblestone']
        ] as const;
        for (const [x, y, z, name] of writes) {
            expect(baseline.writeName(x, y, z, name)).toBe(true);
            expect(writeFast(x, y, z, name)).toBe(true);
        }
        expect(baseline.writeName(-1, -60, 0, 'minecraft:diamond_block')).toBe(false);
        expect(writeFast(-1, -60, 0, 'minecraft:diamond_block')).toBe(false);

        expect(fast.stateAt(0, -61, 0).name).toBe('minecraft:grass_block');
        expect(fast.featureWorld().getBlock({ x: 0, y: -61, z: 0 }).name).toBe('minecraft:grass_block');
        expect(fast.centerBlockSlots()).toEqual(baseline.centerBlockSlots());

        const position = { x: 0, y: -61, z: 0 };
        for (const built of [baseline, fast]) {
            const world = built.featureWorld();
            world.setBlock(position, { name: 'minecraft:chest', properties: {} });
            world.setBlockEntity?.(position, { id: 'minecraft:chest' });
            built.beginWriteTracking();
            built.writeName(position.x, position.y, position.z, 'minecraft:stone');
        }
        expect(fast.centerBlockEntities()).toEqual(baseline.centerBlockEntities());
        expect(fast.takeTrackedPatches()).toEqual(baseline.takeTrackedPatches());
    });

    it('routes name-only surface writes through the direct palette path', () => {
        const built = terrainTile(0, 0);
        const surface = built.surfaceChunk();

        surface.setBlock(0, -62, 0, 'minecraft:stone');
        surface.setBlock(0, -61, 0, 'minecraft:dirt');

        expect(built.stateAt(0, -61, 0).name).toBe('minecraft:dirt');
        expect(built.centerBlockSlots().columnTops[0]).toBe(-61);
    });

    it('refuses direct terrain writes after the region becomes observable', () => {
        const built = terrainTile(0, 0);
        built.writeName(0, 10, 0, 'minecraft:stone');

        expect(() => built.createTerrainNameWriter()).toThrow('fresh, untracked region');
    });

    it('returns to tracked writes if the region starts tracking during a terrain write sequence', () => {
        const built = terrainTile(0, 0);
        const writeTerrain = built.createTerrainNameWriter();
        built.beginWriteTracking();

        expect(writeTerrain(0, 10, 0, 'minecraft:stone')).toBe(true);
        expect(built.takeTrackedPatches()[0]?.blocks).toEqual([
            { x: 0, y: 10, z: 0, block: { java: { name: 'minecraft:stone', properties: {} } } }
        ]);
    });
});

describe('transfer', () => {
    it('round trips compact biome sections through the transfer list', () => {
        const built = terrainTile(1, -2);
        const nonuniform = new Uint16Array(4096).fill(7);
        nonuniform[0] = 3;
        const ids = new Uint16Array(4097);
        ids[0] = 1;
        ids.set(nonuniform, 1);
        const offsets = new Uint32Array([0, 1, 4097]);
        built.setBiomeSections({ ids, offsets });

        const transferred = built.transfer();
        expect(transferred.transferList).toContain(ids.buffer);
        expect(transferred.transferList).toContain(offsets.buffer);
        const delivered = structuredClone(transferred.payload, { transfer: [...transferred.transferList] });
        const landed = GenerationRegion.adopt(delivered, {
            seaLevel: 63,
            seed: SEED,
            blocks: createJavaBlockOracle(new Map()),
            biomeAt: () => 'minecraft:plains'
        });

        expect(landed.biomeSection(0)).toBe(1);
        expect(landed.biomeSection(1)).toEqual(nonuniform);
        expect(landed.workerInput()).not.toHaveProperty('biomeSections');
    });

    it('rebuilds air classification before updating an adopted column ceiling', () => {
        const built = terrainTile(0, 0);
        built.writeName(0, -64, 0, STONE.name);
        built.writeName(0, -63, 0, CAVE_AIR);
        built.writeName(0, -62, 0, STONE.name);
        const { payload } = built.transfer();

        const landed = GenerationRegion.adopt(payload, {
            seaLevel: 63,
            seed: SEED,
            blocks: createJavaBlockOracle(new Map()),
            biomeAt: () => 'minecraft:plains'
        });
        landed.writeName(0, -62, 0, CAVE_AIR);

        expect(landed.centerBlockSlots().columnTops[0]).toBe(-64);
    });

    it('comes back the same region on the other side of a thread boundary', () => {
        const built = terrainTile(1, -2);
        built.write(20, 64, -30, STONE);
        built.write(31, -64, -17, { name: 'minecraft:bedrock', properties: {} });
        built.write(20, 70, -30, { name: 'minecraft:oak_log', properties: { axis: 'y' } });
        built.writeBedrock(21, 70, -31, { name: 'minecraft:bone_block', states: { pillar_axis: 'y' } });
        built.featureWorld().setBlockEntity?.({ x: 20, y: 64, z: -30 }, { id: 'minecraft:chest' });
        built.spawnEntityAt('minecraft:end_crystal', 20.5, 65, -29.5, 90, {
            beamTarget: { x: 0, y: 128, z: 0 },
            invulnerable: true
        });
        built.freezeSurfaceHeights();

        const before = {
            stone: built.stateAt(20, 64, -30),
            log: built.stateAt(20, 70, -30),
            bedrock: built.blockAt(21, 70, -31),
            surface: built.surfaceChunk().surfaceHeight(4, 2),
            blockEntities: built.centerBlockEntities(),
            spawns: built.centerEntitySpawns(),
            slots: [...built.centerBlockSlots().slots]
        };

        const { payload, transferList } = built.transfer();
        expect(transferList).toHaveLength(3);

        const landed = GenerationRegion.adopt(payload, {
            seaLevel: 63,
            seed: SEED,
            blocks: createJavaBlockOracle(new Map()),
            biomeAt: () => 'minecraft:plains'
        });

        expect(landed.stateAt(20, 64, -30)).toEqual(before.stone);
        expect(landed.stateAt(20, 70, -30)).toEqual(before.log);
        expect(landed.blockAt(21, 70, -31)).toEqual(before.bedrock);
        expect(landed.surfaceChunk().surfaceHeight(4, 2)).toBe(before.surface);
        expect(landed.centerBlockEntities()).toEqual(before.blockEntities);
        expect(landed.centerEntitySpawns()).toEqual(before.spawns);
        expect(landed.centerEntitySpawns()[0]).toMatchObject({
            beamTarget: { x: 0, y: 128, z: 0 },
            invulnerable: true
        });
        expect([...landed.centerBlockSlots().slots]).toEqual(before.slots);
    });

    it('keeps writing into the same palette slots it arrived with', () => {
        const built = terrainTile(0, 0);
        built.write(1, 0, 1, STONE);
        const { payload } = built.transfer();

        const landed = GenerationRegion.adopt(payload, {
            seaLevel: 63,
            seed: SEED,
            blocks: createJavaBlockOracle(new Map()),
            biomeAt: () => 'minecraft:plains'
        });
        const slotsBefore = landed.centerBlockSlots().palette.length;

        // The same state again takes the slot it already has, rather than a second one.
        landed.write(2, 0, 2, STONE);
        expect(landed.centerBlockSlots().palette).toHaveLength(slotsBefore);
        expect(landed.stateAt(2, 0, 2)).toEqual(STONE);

        // And a new one appends.
        landed.write(3, 0, 3, { name: 'minecraft:dirt', properties: {} });
        expect(landed.centerBlockSlots().palette).toHaveLength(slotsBefore + 1);
    });
});
