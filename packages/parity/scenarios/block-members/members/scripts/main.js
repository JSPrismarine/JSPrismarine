/**
 * The `block-members` scenario: what a block and a permutation answer about their type, their
 * neighbors, liquids and light, and the block type and state registries, in the flat world whose
 * grass is at y -61. Everything runs once the chunk at the origin has loaded.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { BlockPermutation, BlockStates, BlockTypes, LiquidType, system, world } from '@minecraft/server';

const PACK = 'members';
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
        record(event, { value: call() });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** A block as plain data: its type and location. */
const where = (block) => (block === undefined ? null : { typeId: block.typeId, x: block.x, y: block.y, z: block.z });

/** Runs `run` once the chunk at the origin is loaded, after a ticking area over it. */
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
            run(overworld);
        }, 1);
    });
};

whenLoaded((overworld) => {
    const set = (x, y, z, type, states) => {
        const block = overworld.getBlock({ x, y, z });
        block.setPermutation(BlockPermutation.resolve(type, states));
        return block;
    };
    // The scenario's own ground, so it does not depend on how the flat world was generated: grass
    // over dirt with air above, and a torch two blocks off for block light.
    set(2, -62, 2, 'minecraft:dirt');
    set(2, -61, 2, 'minecraft:grass_block');
    for (let y = -60; y <= -55; y++) set(2, y, 2, 'minecraft:air');
    for (const [x, z] of [
        [1, 2],
        [3, 2],
        [2, 1],
        [2, 3]
    ])
        set(x, -61, z, 'minecraft:air');
    set(2, -62, 3, 'minecraft:air');
    set(0, -60, 2, 'minecraft:torch');
    // Light settles over the next ticks.
    system.runTimeout(() => check(overworld, set), 40);
});

const check = (overworld, set) => {
    const grass = overworld.getBlock({ x: 2, y: -61, z: 2 });
    attempt('above', () => where(grass.above()));
    attempt('above 3', () => where(grass.above(3)));
    attempt('below', () => where(grass.below()));
    attempt('below 0', () => where(grass.below(0)));
    attempt('below -2', () => where(grass.below(-2)));
    attempt('north south east west', () => [grass.north(), grass.south(), grass.east(), grass.west()].map(where));
    attempt('offset', () => where(grass.offset({ x: 1, y: 1, z: -1 })));
    attempt('offset fractional', () => where(grass.offset({ x: 0.5, y: -0.5, z: 1.7 })));
    attempt('below the world', () => where(grass.below(10)));
    attempt('above the world', () => where(grass.above(400)));
    attempt('offset into an unloaded chunk', () => where(grass.offset({ x: 1000, y: 0, z: 0 })));
    attempt('center', () => grass.center());
    attempt('bottomCenter', () => grass.bottomCenter());
    attempt('isValid', () => grass.isValid);
    attempt('type', () => grass.type.id);
    attempt('isAir isLiquid isSolid', () => [grass.isAir, grass.isLiquid, grass.isSolid]);
    attempt('air above', () => {
        const air = grass.above(5);
        return [air.isAir, air.isLiquid, air.isSolid, air.localizationKey, air.getTags()];
    });
    attempt('localizationKey', () => grass.localizationKey);
    attempt('getTags', () => grass.getTags().sort());
    attempt('hasTag', () => [
        grass.hasTag('grass'),
        grass.hasTag('minecraft:grass'),
        grass.hasTag('dirt'),
        grass.hasTag('stone')
    ]);
    attempt('matches', () => [
        grass.matches('minecraft:grass_block'),
        grass.matches('grass_block'),
        grass.matches('minecraft:dirt'),
        grass.matches('minecraft:grass_block', {})
    ]);
    attempt('getItemStack', () => {
        const stack = grass.getItemStack();
        return [stack?.typeId, stack?.amount];
    });
    attempt('getItemStack 5', () => grass.getItemStack(5).amount);
    attempt('getItemStack of air', () => grass.above(5).getItemStack() === undefined);
    attempt('getLightLevel', () => [
        grass.getLightLevel(),
        grass.above().getLightLevel(),
        grass.below().getLightLevel(),
        grass.above().west().getLightLevel()
    ]);
    attempt('getSkyLightLevel', () => [
        grass.getSkyLightLevel(),
        grass.above().getSkyLightLevel(),
        grass.below().getSkyLightLevel()
    ]);
    attempt('getRedstonePower of grass', () => grass.getRedstonePower() ?? null);
    attempt('getMapColor', () => grass.getMapColor());
    attempt('getParts of grass', () => grass.getParts()?.map(where) ?? null);
    attempt('liquid answers of grass', () => [
        grass.canContainLiquid(LiquidType.Water),
        grass.isLiquidBlocking(LiquidType.Water),
        grass.canBeDestroyedByLiquidSpread(LiquidType.Water),
        grass.liquidSpreadCausesSpawn(LiquidType.Water)
    ]);

    const log = set(3, -60, 3, 'minecraft:oak_log', { pillar_axis: 'x' });
    attempt('log matches', () => [
        log.matches('minecraft:oak_log', { pillar_axis: 'x' }),
        log.matches('minecraft:oak_log', { pillar_axis: 'y' }),
        log.matches('minecraft:oak_log', { jsp_no_such_state: 1 })
    ]);
    attempt('log tags', () => log.getTags().sort());
    attempt('log isSolid', () => log.isSolid);
    attempt('log getMapColor', () => log.getMapColor());
    const fence = set(4, -60, 3, 'minecraft:oak_fence');
    attempt('fence isSolid', () => fence.isSolid);
    attempt('fence liquid answers', () => [
        fence.canContainLiquid(LiquidType.Water),
        fence.isLiquidBlocking(LiquidType.Water),
        fence.isWaterlogged
    ]);
    attempt('setWaterlogged fence', () => {
        fence.setWaterlogged(true);
        return [fence.isWaterlogged, fence.typeId];
    });
    attempt('setWaterlogged false', () => {
        fence.setWaterlogged(false);
        return fence.isWaterlogged;
    });
    attempt('setWaterlogged a log', () => log.setWaterlogged(true));
    const torch = set(5, -60, 3, 'minecraft:torch');
    attempt('torch isSolid', () => torch.isSolid);
    attempt('torch liquid answers', () => [
        torch.canContainLiquid(LiquidType.Water),
        torch.isLiquidBlocking(LiquidType.Water),
        torch.canBeDestroyedByLiquidSpread(LiquidType.Water),
        torch.liquidSpreadCausesSpawn(LiquidType.Water)
    ]);
    attempt('torch getLightLevel', () => [torch.getLightLevel(), torch.east().getLightLevel()]);
    const water = set(6, -60, 3, 'minecraft:water');
    attempt('water isLiquid isSolid isAir', () => [water.isLiquid, water.isSolid, water.isAir, water.isWaterlogged]);
    attempt('water getItemStack', () => water.getItemStack()?.typeId ?? null);
    attempt('water localizationKey', () => water.localizationKey);
    const door = set(7, -60, 3, 'minecraft:wooden_door');
    attempt('door getParts', () => door.getParts()?.map(where) ?? null);
    attempt('door getItemStack', () => door.getItemStack()?.typeId ?? null);
    const slab = set(8, -60, 3, 'minecraft:oak_slab');
    attempt('slab isSolid', () => slab.isSolid);
    attempt('slab waterlog answers', () => [
        slab.canContainLiquid(LiquidType.Water),
        slab.isLiquidBlocking(LiquidType.Water)
    ]);
    attempt('trySetPermutation', () => [
        log.trySetPermutation(BlockPermutation.resolve('minecraft:stone')),
        log.typeId
    ]);
    attempt('trySetPermutation the same type', () => [
        log.trySetPermutation(BlockPermutation.resolve('minecraft:oak_log', { pillar_axis: 'z' })),
        log.permutation.getState('pillar_axis')
    ]);
    attempt('trySetPermutation air with stone', () => {
        const air = overworld.getBlock({ x: 10, y: -58, z: 3 });
        return [air.trySetPermutation(BlockPermutation.resolve('minecraft:stone')), air.typeId];
    });
    attempt('trySetPermutation grass with air', () => {
        const ground = set(11, -60, 3, 'minecraft:dirt');
        return [ground.trySetPermutation(BlockPermutation.resolve('minecraft:air')), ground.typeId];
    });
    attempt('trySetPermutation a torch onto air', () => {
        const air = overworld.getBlock({ x: 12, y: -55, z: 3 });
        return [air.trySetPermutation(BlockPermutation.resolve('minecraft:torch')), air.typeId];
    });
    attempt('getComponents of grass', () =>
        grass
            .getComponents()
            .map((component) => component.typeId)
            .sort()
    );
    attempt('getComponents of a chest', () =>
        set(9, -60, 3, 'minecraft:chest')
            .getComponents()
            .map((component) => component.typeId)
            .sort()
    );

    const permutation = BlockPermutation.resolve('minecraft:oak_log', { pillar_axis: 'z' });
    attempt('permutation localizationKey', () => permutation.localizationKey);
    attempt('permutation getTags', () => permutation.getTags().sort());
    attempt('permutation hasTag', () => [permutation.hasTag('log'), permutation.hasTag('wood')]);
    attempt('permutation matches', () => [
        permutation.matches('minecraft:oak_log'),
        permutation.matches('oak_log', { pillar_axis: 'z' }),
        permutation.matches('minecraft:oak_log', { pillar_axis: 'x' })
    ]);
    attempt('permutation getItemStack', () => {
        const stack = permutation.getItemStack(3);
        return [stack?.typeId, stack?.amount];
    });
    attempt('permutation getItemStack 0', () => permutation.getItemStack(0)?.amount ?? null);
    attempt('withState', () => permutation.withState('pillar_axis', 'y').getAllStates());
    attempt('withState unchanged original', () => permutation.getAllStates());
    attempt('withState unknown state', () => permutation.withState('jsp_no_such_state', 'y'));
    attempt('withState bad value', () => permutation.withState('pillar_axis', 'w').getAllStates());
    attempt('withState wrong type', () => permutation.withState('pillar_axis', 1).getAllStates());
    attempt('withState a number state', () =>
        BlockPermutation.resolve('minecraft:wheat').withState('growth', 5).getState('growth')
    );
    attempt('withState a number out of range', () =>
        BlockPermutation.resolve('minecraft:wheat').withState('growth', 99).getState('growth')
    );
    attempt('permutation liquid answers of a kelp', () => {
        const kelp = BlockPermutation.resolve('minecraft:kelp');
        return [kelp.canContainLiquid(LiquidType.Water), kelp.isLiquidBlocking(LiquidType.Water)];
    });

    attempt('BlockTypes.get', () => BlockTypes.get('minecraft:stone')?.id);
    attempt('BlockTypes.get without a namespace', () => BlockTypes.get('stone')?.id ?? null);
    attempt('BlockTypes.get unknown', () => BlockTypes.get('minecraft:jsp_no_such_block') === undefined);
    attempt(
        'BlockTypes.get the same object',
        () => BlockTypes.get('minecraft:stone') === BlockTypes.get('minecraft:stone')
    );
    attempt('BlockType localizationKey', () => BlockTypes.get('minecraft:stone').localizationKey);
    attempt('BlockTypes.getAll', () => {
        const all = BlockTypes.getAll();
        return [all.length > 1000, all.some((type) => type.id === 'minecraft:stone'), typeof all[0].id];
    });
    attempt('BlockStates.get', () => {
        const state = BlockStates.get('pillar_axis');
        return [state?.id, state?.validValues];
    });
    attempt('BlockStates.get with a namespace', () => BlockStates.get('minecraft:cardinal_direction')?.id ?? null);
    attempt('BlockStates.get unknown', () => BlockStates.get('jsp_no_such_state') === undefined);
    attempt('BlockStates.get a number state', () => BlockStates.get('age')?.validValues);
    attempt('BlockStates.get a boolean state', () => BlockStates.get('open_bit')?.validValues);
    attempt('BlockStates.getAll', () => BlockStates.getAll().length > 50);
    record('blocks done');
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
};
