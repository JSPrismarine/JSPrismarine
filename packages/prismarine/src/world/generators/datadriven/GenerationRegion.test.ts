/**
 * The optional `FeatureWorld` hooks, run through the vanilla features that need them.
 *
 * Each test builds a region, runs one real feature into it and reads back what the region kept,
 * because the thing worth checking is that a generated chest, spawner, gateway or crystal
 * survives the trip from `@jsprismarine/features` into a chunk, not that the hook was called.
 */
import { WorldgenRandom, bonusChest, endGateway, endSpike, monsterRoom } from '@jsprismarine/features';
import { describe, expect, it } from 'vitest';

import { GenerationRegion } from './GenerationRegion';
import { createJavaBlockOracle } from './javaBlockOracle';
import { createBlockEntity, createEntitySpawn } from './javaGeneratedContent';

const STONE = { name: 'minecraft:stone', properties: {} };
const AIR = { name: 'minecraft:air', properties: {} };

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

/** Fills the whole three by three chunk window with stone up to `top`. */
const fillStone = (built: GenerationRegion, top: number): void => {
    for (let x = -16; x < 32; x++) {
        for (let z = -16; z < 32; z++) {
            for (let y = top - 24; y <= top; y++) built.write(x, y, z, STONE);
        }
    }
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

    it('keeps nothing for a position outside the region', () => {
        const built = region();
        built.featureWorld().spawnEntity?.('minecraft:end_crystal', { x: 500, y: 64, z: 500 }, 0);

        expect(built.centerEntitySpawns()).toHaveLength(0);
    });
});

describe('neighbor chunk data', () => {
    it('copies neighboring terrain into the feature view', () => {
        const source = terrainTile(1, 0);
        source.writeName(16, 50, 8, 'minecraft:stone');
        source.freezeSurfaceHeights();

        const built = region();
        built.copyCenterFrom(source);

        expect(built.featureWorld().getBlock({ x: 16, y: 50, z: 8 }).name).toBe('minecraft:stone');
        expect(built.featureWorld().getHeight('WORLD_SURFACE_WG', 16, 8)).toBe(51);
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
        world.spawnEntity?.('minecraft:end_crystal', { x: 16, y: 65, z: 8 }, 90);

        const [patch] = built.takeTrackedPatches();
        if (patch === undefined) throw new Error('Cross-chunk writes did not produce a patch');
        expect(patch).toMatchObject({ chunkX: 1, chunkZ: 0 });
        expect(patch?.blocks).toHaveLength(1);
        expect(patch?.blockEntities).toHaveLength(1);
        expect(patch?.entitySpawns).toHaveLength(1);

        const destination = terrainTile(1, 0);
        destination.applyPatch(patch);
        expect(destination.stateAt(16, 64, 8).name).toBe('minecraft:chest');
        expect(destination.centerBlockEntities()).toHaveLength(1);
        expect(destination.centerEntitySpawns()).toHaveLength(1);
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

describe('centerBlockSlots', () => {
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

describe('transfer', () => {
    it('comes back the same region on the other side of a thread boundary', () => {
        const built = terrainTile(1, -2);
        built.write(20, 64, -30, STONE);
        built.write(31, -64, -17, { name: 'minecraft:bedrock', properties: {} });
        built.write(20, 70, -30, { name: 'minecraft:oak_log', properties: { axis: 'y' } });
        built.writeBedrock(21, 70, -31, { name: 'minecraft:bone_block', states: { pillar_axis: 'y' } });
        built.featureWorld().setBlockEntity?.({ x: 20, y: 64, z: -30 }, { id: 'minecraft:chest' });
        built.spawnEntityAt('minecraft:end_crystal', 20.5, 65, -29.5, 90);
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
