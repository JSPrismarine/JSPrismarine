/**
 * The `dimension-blocks` scenario: a dimension's `setBlockType` and `setBlockPermutation`, its
 * block searches up, down and from the top, its light and biome at a location, `BiomeTypes`, its
 * block and entity raycasts, the entities at a block, `spawnItem`, `spawnXp`, `createExplosion`,
 * `placeFeature` and the structures generation left at a location. Everything runs once the chunk
 * at the origin has loaded, on blocks the scenario places at y 20 to 40, clear of the flat
 * world's ground, which BDS lays at y 0 to 3 and JSPrismarine at y -64 to -61, at noon with the
 * daylight cycle stopped.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { BlockPermutation, BiomeTypes, ItemStack, system, world } from '@minecraft/server';

const PACK = 'blocks';
let seq = 0;
let start = 0;

/** Logs one observation, stamped with the pack's sequence number and the tick since the chunks loaded. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(
        `DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick - start, event, ...observed })}`
    );
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        const value = call();
        record(event, { value: value === undefined ? 'undefined' : value });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** Runs `run` once the chunk at the origin is loaded, adding a ticking area for BDS. */
const whenLoaded = (run) => {
    world.afterEvents.worldLoad.subscribe(() => {
        const overworld = world.getDimension('overworld');
        try {
            overworld.runCommand('tickingarea add -16 0 -16 15 0 15 jsp_scenario');
        } catch {
            // A world that loads its spawn chunks without one may refuse it.
        }
        const waiting = system.runInterval(() => {
            let loaded = false;
            try {
                loaded = overworld.getBlock({ x: 0, y: -61, z: 0 }) !== undefined;
            } catch {
                // Not loaded yet.
            }
            if (!loaded) return;
            system.clearRun(waiting);
            start = system.currentTick;
            run();
        }, 1);
    });
};

/** A block as plain data, or null for none. */
const describe = (block) => (block === undefined ? null : { type: block.typeId, location: block.location });

/** The types of the entities a list holds, sorted. */
const types = (entities) => entities.map((entity) => entity.typeId).sort();

whenLoaded(() => {
    const overworld = world.getDimension('overworld');
    world.gameRules.doDayLightCycle = false;
    world.gameRules.doMobSpawning = false;
    world.setTimeOfDay(6000);
    const typeAt = (location) => overworld.getBlock(location)?.typeId ?? null;

    attempt('setBlockType', () => {
        overworld.setBlockType({ x: 2, y: 20, z: 2 }, 'stone');
        return typeAt({ x: 2, y: 20, z: 2 });
    });
    attempt('setBlockType of a BlockType', () => {
        overworld.setBlockType({ x: 2, y: 21, z: 2 }, BlockPermutation.resolve('minecraft:stone').type);
        return typeAt({ x: 2, y: 21, z: 2 });
    });
    attempt('setBlockType of an unknown type', () => overworld.setBlockType({ x: 2, y: 20, z: 2 }, 'jsp:missing'));
    attempt('setBlockType in an unloaded chunk', () => overworld.setBlockType({ x: 100000, y: 20, z: 0 }, 'stone'));
    attempt('setBlockType above the world', () => overworld.setBlockType({ x: 2, y: 400, z: 2 }, 'stone'));
    attempt('setBlockPermutation', () => {
        overworld.setBlockPermutation(
            { x: 3, y: 20, z: 2.9 },
            BlockPermutation.resolve('minecraft:oak_log', { pillar_axis: 'x' })
        );
        const block = overworld.getBlock({ x: 3, y: 20, z: 2 });
        return { type: block.typeId, axis: block.permutation.getState('pillar_axis') };
    });
    attempt('setBlockPermutation below the world', () =>
        overworld.setBlockPermutation({ x: 3, y: -100, z: 2 }, BlockPermutation.resolve('minecraft:stone'))
    );

    overworld.setBlockType({ x: 4, y: 25, z: 4 }, 'stone');
    overworld.setBlockType({ x: 4, y: 26, z: 4 }, 'water');
    overworld.setBlockType({ x: 4, y: 27, z: 4 }, 'short_grass');
    overworld.setBlockType({ x: 4, y: 30, z: 4 }, 'stone');
    attempt('getBlockAbove', () => describe(overworld.getBlockAbove({ x: 4, y: 25, z: 4 })));
    attempt('getBlockAbove with liquids', () =>
        describe(overworld.getBlockAbove({ x: 4, y: 25, z: 4 }, { includeLiquidBlocks: true }))
    );
    attempt('getBlockAbove without passable blocks', () =>
        describe(overworld.getBlockAbove({ x: 4, y: 25, z: 4 }, { includePassableBlocks: false }))
    );
    attempt('getBlockAbove with passable blocks', () =>
        describe(overworld.getBlockAbove({ x: 4, y: 26, z: 4 }, { includePassableBlocks: true }))
    );
    attempt('getBlockAbove within 1', () =>
        describe(overworld.getBlockAbove({ x: 4, y: 25, z: 4 }, { maxDistance: 1 }))
    );
    attempt('getBlockAbove of the top block', () => describe(overworld.getBlockAbove({ x: 4, y: 30, z: 4 })));
    attempt('getBlockAbove from water', () => describe(overworld.getBlockAbove({ x: 4, y: 26, z: 4 })));
    attempt('getBlockAbove from water without passable blocks', () =>
        describe(overworld.getBlockAbove({ x: 4, y: 26, z: 4 }, { includePassableBlocks: false }))
    );
    attempt('getBlockAbove from water with liquids', () =>
        describe(overworld.getBlockAbove({ x: 4, y: 26, z: 4 }, { includeLiquidBlocks: true }))
    );
    attempt('getBlockBelow from stone', () => describe(overworld.getBlockBelow({ x: 4, y: 30, z: 4 })));
    attempt('getBlockBelow from air', () => describe(overworld.getBlockBelow({ x: 4, y: 29, z: 4 })));
    attempt('getBlockBelow from air without passable blocks', () =>
        describe(overworld.getBlockBelow({ x: 4, y: 29, z: 4 }, { includePassableBlocks: false }))
    );
    attempt('getBlockBelow from air with liquids', () =>
        describe(
            overworld.getBlockBelow({ x: 4, y: 29, z: 4 }, { includeLiquidBlocks: true, includePassableBlocks: false })
        )
    );
    for (const [label, options] of [
        ['default', undefined],
        ['passable', { includePassableBlocks: true }],
        ['liquid', { includeLiquidBlocks: true }],
        ['both', { includeLiquidBlocks: true, includePassableBlocks: true }]
    ]) {
        attempt(`getBlockFromRay down through grass and water, ${label}`, () =>
            describe(overworld.getBlockFromRay({ x: 4.5, y: 29.5, z: 4.5 }, { x: 0, y: -1, z: 0 }, options)?.block)
        );
        attempt(`getBlockFromRay up from water, ${label}`, () =>
            describe(overworld.getBlockFromRay({ x: 4.5, y: 26.5, z: 4.5 }, { x: 0, y: 1, z: 0 }, options)?.block)
        );
    }
    attempt('getBlockBelow', () => describe(overworld.getBlockBelow({ x: 4, y: 40, z: 4 })));
    attempt('getBlockBelow within 5', () =>
        describe(overworld.getBlockBelow({ x: 4, y: 40, z: 4 }, { maxDistance: 5 }))
    );
    attempt('getBlockBelow fractional', () => describe(overworld.getBlockBelow({ x: 4.7, y: 33.2, z: 4.1 })));
    attempt('getTopmostBlock', () => describe(overworld.getTopmostBlock({ x: 4, z: 4 })));
    attempt('getTopmostBlock fractional', () => describe(overworld.getTopmostBlock({ x: 4.9, z: 4.2 })));
    attempt('getTopmostBlock from 35', () => describe(overworld.getTopmostBlock({ x: 4, z: 4 }, 35)));
    attempt('getTopmostBlock from 30', () => describe(overworld.getTopmostBlock({ x: 4, z: 4 }, 30)));
    attempt('getTopmostBlock from 28', () => describe(overworld.getTopmostBlock({ x: 4, z: 4 }, 28)));
    attempt('getTopmostBlock in an unloaded chunk', () => describe(overworld.getTopmostBlock({ x: 100000, z: 0 })));

    overworld.setBlockType({ x: 6, y: 24, z: 6 }, 'stone');

    attempt('getLightLevel in the open', () => overworld.getLightLevel({ x: 6, y: 40, z: 6 }));
    attempt('getSkyLightLevel in the open', () => overworld.getSkyLightLevel({ x: 6, y: 40, z: 6 }));
    attempt('getLightLevel in stone', () => overworld.getLightLevel({ x: 6, y: 24, z: 6 }));
    attempt('getSkyLightLevel in stone', () => overworld.getSkyLightLevel({ x: 6, y: 24, z: 6 }));
    attempt('getLightLevel in an unloaded chunk', () => overworld.getLightLevel({ x: 100000, y: 20, z: 0 }));
    attempt('getLightLevel above the world', () => overworld.getLightLevel({ x: 0, y: 1000, z: 0 }));

    attempt('getBiome', () => overworld.getBiome({ x: 0, y: 20, z: 0 }).id);
    attempt('getBiome in an unloaded chunk', () => overworld.getBiome({ x: 100000, y: 20, z: 0 }).id);
    attempt('BiomeTypes.get', () => BiomeTypes.get('plains')?.id ?? null);
    attempt('BiomeTypes.get with the namespace', () => BiomeTypes.get('minecraft:desert')?.id ?? null);
    attempt('BiomeTypes.get of an unknown biome', () => BiomeTypes.get('jsp:missing') ?? null);
    attempt('BiomeTypes.getAll includes plains and desert', () => {
        const ids = BiomeTypes.getAll().map((biome) => biome.id);
        return [ids.includes('minecraft:plains'), ids.includes('minecraft:desert'), ids.length > 50];
    });
    attempt('BiomeType.getTags', () => BiomeTypes.get('plains').getTags().sort());
    attempt('BiomeType.hasTags', () => [
        BiomeTypes.get('plains').hasTags(['overworld', 'plains']),
        BiomeTypes.get('plains').hasTags(['overworld', 'desert']),
        BiomeTypes.get('plains').hasTags([])
    ]);

    for (let x = 0; x <= 10; x++) overworld.setBlockType({ x, y: 19, z: 0 }, 'stone');
    const pig = overworld.spawnEntity('minecraft:pig', { x: 8.5, y: 20, z: 0.5 });
    attempt('getEntitiesAtBlockLocation', () => types(overworld.getEntitiesAtBlockLocation({ x: 8, y: 20, z: 0 })));
    attempt('getEntitiesAtBlockLocation of an empty block', () =>
        types(overworld.getEntitiesAtBlockLocation({ x: 9, y: 20, z: 9 }))
    );
    attempt('getEntitiesFromRay', () =>
        overworld.getEntitiesFromRay({ x: 0.5, y: 20.5, z: 0.5 }, { x: 1, y: 0, z: 0 }).map((hit) => ({
            type: hit.entity.typeId,
            same: hit.entity === pig,
            distance: Math.floor(hit.distance)
        }))
    );
    attempt(
        'getEntitiesFromRay within 5',
        () => overworld.getEntitiesFromRay({ x: 0.5, y: 20.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, { maxDistance: 5 }).length
    );
    attempt('getEntitiesFromRay through a block', () => {
        overworld.setBlockType({ x: 6, y: 20, z: 0 }, 'stone');
        return [
            overworld.getEntitiesFromRay({ x: 0.5, y: 20.5, z: 0.5 }, { x: 1, y: 0, z: 0 }).length,
            overworld.getEntitiesFromRay(
                { x: 0.5, y: 20.5, z: 0.5 },
                { x: 1, y: 0, z: 0 },
                { ignoreBlockCollision: true }
            ).length
        ];
    });
    overworld.setBlockType({ x: 0, y: 25, z: 0 }, 'stone');
    attempt('getBlockFromRay down', () => {
        const hit = overworld.getBlockFromRay({ x: 0.5, y: 35, z: 0.5 }, { x: 0, y: -1, z: 0 });
        return hit === undefined ? null : { ...describe(hit.block), face: hit.face, faceLocation: hit.faceLocation };
    });
    attempt('getBlockFromRay sideways', () => {
        const hit = overworld.getBlockFromRay({ x: 0.5, y: 20.5, z: 0.5 }, { x: 1, y: 0, z: 0 });
        return hit === undefined ? null : { ...describe(hit.block), face: hit.face, faceLocation: hit.faceLocation };
    });
    attempt('getBlockFromRay at an angle', () => {
        const hit = overworld.getBlockFromRay({ x: 0.5, y: 21.5, z: 0.5 }, { x: 1, y: -0.2, z: 0 });
        return hit === undefined ? null : { ...describe(hit.block), face: hit.face, faceLocation: hit.faceLocation };
    });
    attempt('getBlockFromRay within 3', () =>
        describe(overworld.getBlockFromRay({ x: 0.5, y: 35, z: 0.5 }, { x: 0, y: -1, z: 0 }, { maxDistance: 3 })?.block)
    );
    attempt('getBlockFromRay up into nothing', () =>
        describe(overworld.getBlockFromRay({ x: 0.5, y: 35, z: 0.5 }, { x: 0, y: 1, z: 0 })?.block)
    );
    attempt('getBlockFromRay through water', () => {
        const passing = overworld.getBlockFromRay({ x: 4.5, y: 25.5, z: 4.5 }, { x: 0, y: 1, z: 0 });
        const stopping = overworld.getBlockFromRay(
            { x: 4.5, y: 25.5, z: 4.5 },
            { x: 0, y: 1, z: 0 },
            { includeLiquidBlocks: true, includePassableBlocks: true }
        );
        return [passing?.block.typeId ?? null, stopping?.block.typeId ?? null];
    });

    overworld.setBlockType({ x: 10, y: 19, z: 10 }, 'stone');
    overworld.setBlockType({ x: 12, y: 19, z: 12 }, 'stone');
    attempt('spawnItem', () => {
        const item = overworld.spawnItem(new ItemStack('minecraft:diamond', 3), { x: 10.5, y: 20, z: 10.5 });
        return { type: item.typeId, valid: item.isValid };
    });
    attempt('spawnItem in an unloaded chunk', () =>
        overworld.spawnItem(new ItemStack('minecraft:diamond'), { x: 100000, y: 20, z: 0 })
    );
    attempt('spawnXp', () => overworld.spawnXp({ x: 12.5, y: 20, z: 12.5 }, 5));
    attempt('spawnXp of nothing', () => overworld.spawnXp({ x: 12.5, y: 20, z: 12.5 }, 0));
    attempt('spawnXp in an unloaded chunk', () => overworld.spawnXp({ x: 100000, y: 20, z: 0 }, 5));

    overworld.setBlockType({ x: -8, y: 20, z: -8 }, 'stone');
    overworld.setBlockType({ x: -12, y: 20, z: -12 }, 'stone');
    attempt('createExplosion without breaking blocks', () => [
        overworld.createExplosion({ x: -8, y: 20, z: -8 }, 3, { breaksBlocks: false }),
        typeAt({ x: -8, y: 20, z: -8 })
    ]);
    attempt('createExplosion', () => [
        overworld.createExplosion({ x: -12, y: 20, z: -12 }, 3),
        typeAt({ x: -12, y: 20, z: -12 })
    ]);
    attempt('createExplosion of radius 0', () => overworld.createExplosion({ x: -12, y: 20, z: -12 }, 0));
    attempt('createExplosion of radius 2000', () => overworld.createExplosion({ x: -12, y: 20, z: -12 }, 2000));
    attempt('createExplosion in an unloaded chunk', () => overworld.createExplosion({ x: 100000, y: 20, z: 0 }, 2));

    attempt('placeFeature of an unknown feature', () => overworld.placeFeature('jsp:missing', { x: 14, y: 20, z: 2 }));
    attempt('placeFeature of an unknown feature that throws', () =>
        overworld.placeFeature('jsp:missing', { x: 14, y: 20, z: 2 }, true)
    );
    attempt('placeFeatureRule of an unknown rule', () =>
        overworld.placeFeatureRule('jsp:missing', { x: 14, y: 20, z: 2 })
    );
    attempt('getGeneratedStructures', () => overworld.getGeneratedStructures({ x: 0, y: 20, z: 0 }));

    system.runTimeout(() => {
        attempt('entities after a tick', () =>
            types(overworld.getEntities({ location: { x: 10.5, y: 20, z: 10.5 }, maxDistance: 4 }))
        );
        attempt('experience orbs', () => overworld.getEntities({ type: 'minecraft:xp_orb' }).length > 0);
        for (const entity of overworld.getEntities()) {
            if (entity.typeId !== 'minecraft:player') entity.remove();
        }
        world.gameRules.doDayLightCycle = true;
        world.gameRules.doMobSpawning = true;
        console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`);
    }, 2);
});
