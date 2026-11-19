import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { loadLibrary, scriptHostAvailable } from '../../testing/library.test-utils';
import { SystemScripts, worldWithSystem } from './serverWorld.test-utils';

const harness = new SystemScripts(loadLibrary);
afterEach(() => harness.stopAll());
afterAll(() => harness.removeAll());

/** Logs a block as its type and location, or null. */
const DESCRIBE = `const describe = (block) => block === undefined ? null : block.typeId + ' ' + block.y;`;

describe.skipIf(!scriptHostAvailable())("a dimension's blocks, rays and spawns", () => {
    it('writes blocks by type and permutation, and nothing outside the world', () => {
        const world = worldWithSystem();
        const { lines } = harness.start(
            `
            world.afterEvents.worldLoad.subscribe(() => {
                const overworld = world.getDimension('overworld');
                log('type', () => { overworld.setBlockType({ x: 1, y: 20, z: 1 }, 'stone'); return overworld.getBlock({ x: 1, y: 20, z: 1 }).typeId; });
                log('permutation', () => {
                    overworld.setBlockPermutation({ x: 2, y: 20.5, z: 1 }, BlockPermutation.resolve('oak_log', { pillar_axis: 'x' }));
                    return overworld.getBlock({ x: 2, y: 20, z: 1 }).permutation.getState('pillar_axis');
                });
                log('unknown', () => overworld.setBlockType({ x: 1, y: 20, z: 1 }, 'jsp:missing'));
                log('above', () => overworld.setBlockType({ x: 1, y: 400, z: 1 }, 'stone'));
                log('unloaded', () => overworld.setBlockType({ x: 100000, y: 20, z: 1 }, 'stone'));
            });`,
            world
        );
        expect(lines).toEqual([
            'type "minecraft:stone"',
            'permutation "x"',
            'unknown ! Error: Block type jsp:missing not found.',
            'above undefined',
            'unloaded ! LocationInUnloadedChunkError: Trying to access location (100000.0, 20.0, 1.0) which is not in a chunk currently loaded and ticking.'
        ]);
    });

    it('searches up, down and from the top, counting the start, passable blocks, and liquids only when asked', () => {
        const { lines } = harness.start(
            `${DESCRIBE}
            world.afterEvents.worldLoad.subscribe(() => {
                const overworld = world.getDimension('overworld');
                overworld.setBlockType({ x: 4, y: 25, z: 4 }, 'stone');
                overworld.setBlockType({ x: 4, y: 26, z: 4 }, 'water');
                overworld.setBlockType({ x: 4, y: 27, z: 4 }, 'short_grass');
                overworld.setBlockType({ x: 4, y: 30, z: 4 }, 'stone');
                const at = (y) => ({ x: 4, y, z: 4 });
                log('above from stone', () => describe(overworld.getBlockAbove(at(25))));
                log('above from water', () => describe(overworld.getBlockAbove(at(26))));
                log('above from water, no passable', () => describe(overworld.getBlockAbove(at(26), { includePassableBlocks: false })));
                log('above from water, liquids', () => describe(overworld.getBlockAbove(at(26), { includeLiquidBlocks: true })));
                log('below from air', () => describe(overworld.getBlockBelow(at(29))));
                log('below within 1', () => describe(overworld.getBlockBelow(at(29), { maxDistance: 1 })));
                log('topmost', () => describe(overworld.getTopmostBlock({ x: 4, z: 4 })));
                log('topmost from 28', () => describe(overworld.getTopmostBlock({ x: 4, z: 4 }, 28)));
            });`
        );
        expect(lines).toEqual([
            'above from stone "minecraft:stone 25"',
            'above from water "minecraft:short_grass 27"',
            'above from water, no passable "minecraft:stone 30"',
            'above from water, liquids "minecraft:water 26"',
            'below from air "minecraft:short_grass 27"',
            'below within 1 null',
            'topmost "minecraft:stone 30"',
            'topmost from 28 "minecraft:stone 25"'
        ]);
    });

    it('casts rays at blocks and entities, which a block between hides', () => {
        const { lines } = harness.start(
            `${DESCRIBE}
            world.afterEvents.worldLoad.subscribe(() => {
                const overworld = world.getDimension('overworld');
                overworld.setBlockType({ x: 6, y: 20, z: 0 }, 'stone');
                const pig = overworld.spawnEntity('minecraft:pig', { x: 3.5, y: 20, z: 0.5 });
                log('block', () => {
                    const hit = overworld.getBlockFromRay({ x: 0.5, y: 21.5, z: 0.5 }, { x: 1, y: -0.2, z: 0 });
                    return [describe(hit.block), hit.face, hit.faceLocation];
                });
                log('down', () => {
                    const hit = overworld.getBlockFromRay({ x: 6.5, y: 30, z: 0.5 }, { x: 0, y: -1, z: 0 });
                    return [describe(hit.block), hit.face, hit.faceLocation];
                });
                log('short', () => overworld.getBlockFromRay({ x: 0.5, y: 20.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, { maxDistance: 3 }));
                log('entities', () => overworld.getEntitiesFromRay({ x: 0.5, y: 20.5, z: 0.5 }, { x: 1, y: 0, z: 0 }).map((hit) => [hit.entity === pig, hit.distance]));
                log('behind a block', () => overworld.getEntitiesFromRay({ x: 9.5, y: 20.5, z: 0.5 }, { x: -1, y: 0, z: 0 }).length);
                log('at the block', () => overworld.getEntitiesAtBlockLocation({ x: 3, y: 20, z: 0 }).map((entity) => entity === pig));
            });`
        );
        expect(lines).toEqual([
            'block ["minecraft:stone 20","West",{"x":0,"y":0.39999961853027344,"z":0.5}]',
            'down ["minecraft:stone 20","Up",{"x":0.5,"y":0,"z":0.5}]',
            'short undefined',
            'entities [[true,2.549999952316284]]',
            'behind a block 0',
            'at the block [true]'
        ]);
    });

    it('reads light and biomes, spawns items and experience, and sets off explosions', () => {
        const world = worldWithSystem();
        const { lines } = harness.start(
            `
            world.afterEvents.worldLoad.subscribe(() => {
                const overworld = world.getDimension('overworld');
                overworld.setBlockType({ x: 6, y: 24, z: 6 }, 'stone');
                log('light', () => [overworld.getLightLevel({ x: 6, y: 40, z: 6 }), overworld.getLightLevel({ x: 6, y: 24, z: 6 }), overworld.getSkyLightLevel({ x: 6, y: 24, z: 6 })]);
                log('light outside', () => overworld.getLightLevel({ x: 100000, y: 20, z: 0 }));
                log('biome', () => overworld.getBiome({ x: 0, y: 20, z: 0 }).id);
                log('biome types', () => [BiomeTypes.get('plains') === overworld.getBiome({ x: 0, y: 20, z: 0 }), BiomeTypes.get('jsp:none'), BiomeTypes.getAll().length]);
                log('tags', () => [BiomeTypes.get('plains').getTags(), BiomeTypes.get('plains').hasTags(['plains', 'overworld']), BiomeTypes.get('plains').hasTags(['desert'])]);
                log('closest', () => overworld.calculateClosestBiomeFromSeed({ x: 1, y: 2, z: 3 }, 'plains'));
                log('item', () => overworld.spawnItem(new ItemStack('minecraft:apple'), { x: 1, y: 20, z: 1 }).typeId);
                log('xp', () => overworld.spawnXp({ x: 1, y: 20, z: 1 }, 5));
                log('explosion', () => overworld.createExplosion({ x: 6, y: 24, z: 6 }, 2, { breaksBlocks: true }));
                log('after', () => overworld.getBlock({ x: 6, y: 24, z: 6 }).typeId);
                log('nothing', () => overworld.createExplosion({ x: 6, y: 24, z: 6 }, 0));
                log('feature', () => overworld.placeFeature('jsp:none', { x: 0, y: 20, z: 0 }));
                log('structures', () => overworld.getGeneratedStructures({ x: 0, y: 20, z: 0 }));
            });`,
            world
        );
        expect(lines).toEqual([
            'light [15,0,15]',
            'light outside 15',
            'biome "minecraft:plains"',
            'biome types [true,null,2]',
            'tags [["animal","bee_habitat","monster","overworld","plains"],true,false]',
            'closest {"x":1,"y":2,"z":3}',
            'item "minecraft:item"',
            'xp undefined',
            'explosion true',
            'after "minecraft:air"',
            'nothing false',
            'feature ! InvalidArgumentError: Invalid value passed to argument [0]. Feature name jsp:none cannot be found in the registry',
            'structures []'
        ]);
        expect(world.worldSystem.explosions).toEqual([
            { radius: 2, breaksBlocks: true, causesFire: false, allowUnderwater: false }
        ]);
        expect(world.entities('minecraft:overworld').map((entity) => entity.typeId)).toEqual([
            'minecraft:item',
            'minecraft:xp_orb'
        ]);
    });
});
