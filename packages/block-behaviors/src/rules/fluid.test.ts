import { describe, expect, it } from 'vitest';

import { createVoxelWorld } from '../voxelWorld';
import {
    applyLavaWaterReaction,
    depthStep,
    LAVA_SPREAD_TICKS,
    lavaWaterProduct,
    MAX_LIQUID_DEPTH,
    NETHER,
    NETHER_LAVA_SPREAD_TICKS,
    spreadLiquid,
    spreadTicks,
    WATER_SPREAD_TICKS
} from './fluid';

const source = { x: 0, y: 1, z: 0 };

const floorUnder = (world: ReturnType<typeof createVoxelWorld>['overworld']): void => {
    world.fill({ x: -4, y: 0, z: -4 }, { x: 4, y: 0, z: 4 }, 'minecraft:stone');
};

describe('depthStep and spreadTicks', () => {
    it('gives lava a longer step and a slower tick outside the nether', () => {
        expect(depthStep('minecraft:water', 'minecraft:overworld')).toBe(1);
        expect(depthStep('minecraft:lava', 'minecraft:overworld')).toBe(2);
        expect(depthStep('minecraft:lava', NETHER)).toBe(1);

        expect(spreadTicks('minecraft:water', 'minecraft:overworld')).toBe(WATER_SPREAD_TICKS);
        expect(spreadTicks('minecraft:lava', 'minecraft:overworld')).toBe(LAVA_SPREAD_TICKS);
        expect(spreadTicks('minecraft:lava', NETHER)).toBe(NETHER_LAVA_SPREAD_TICKS);
    });
});

describe('spreadLiquid', () => {
    it('falls straight down and spreads no further sideways', () => {
        const world = createVoxelWorld().overworld;
        world.set(source, 'minecraft:water');

        expect(spreadLiquid(world, world.block(source))).toEqual({ down: true, sides: [] });
        expect(world.identifierAt({ x: 0, y: 0, z: 0 })).toBe('minecraft:flowing_water');
    });

    it('spreads to all four sides at depth 1 when it cannot fall', () => {
        const world = createVoxelWorld().overworld;
        floorUnder(world);
        world.set(source, 'minecraft:water');

        expect(spreadLiquid(world, world.block(source)).sides).toEqual(['north', 'south', 'west', 'east']);
        expect(world.stateAt({ x: 1, y: 1, z: 0 }, 'liquid_depth')).toBe(1);
    });

    it('stops once the depth would pass the maximum', () => {
        const world = createVoxelWorld().overworld;
        floorUnder(world);
        world.set(source, 'minecraft:flowing_water', { liquid_depth: MAX_LIQUID_DEPTH });

        expect(spreadLiquid(world, world.block(source))).toEqual({ down: false, sides: [] });
    });

    it('does not rewrite a position already holding the same liquid as shallow', () => {
        const world = createVoxelWorld().overworld;
        floorUnder(world);
        world.set(source, 'minecraft:water');
        world.set({ x: 1, y: 1, z: 0 }, 'minecraft:flowing_water', { liquid_depth: 1 });

        expect(spreadLiquid(world, world.block(source)).sides).toEqual(['north', 'south', 'west']);
    });

    it('reaches three blocks of overworld lava, which is the doubled step', () => {
        const world = createVoxelWorld().overworld;
        floorUnder(world);
        world.set(source, 'minecraft:lava');

        spreadLiquid(world, world.block(source));

        expect(world.stateAt({ x: 1, y: 1, z: 0 }, 'liquid_depth')).toBe(2);

        spreadLiquid(world, world.block({ x: 1, y: 1, z: 0 }));

        expect(world.stateAt({ x: 2, y: 1, z: 0 }, 'liquid_depth')).toBe(4);
    });
});

describe('lavaWaterProduct', () => {
    it('makes obsidian from a source, stone from above and cobblestone from the side', () => {
        const world = createVoxelWorld().overworld;
        world.set(source, 'minecraft:lava');

        expect(lavaWaterProduct(world.block(source), false)).toBe('minecraft:obsidian');

        world.set(source, 'minecraft:flowing_lava', { liquid_depth: 1 });

        expect(lavaWaterProduct(world.block(source), true)).toBe('minecraft:stone');
        expect(lavaWaterProduct(world.block(source), false)).toBe('minecraft:cobblestone');
    });

    it('has no product for water', () => {
        const world = createVoxelWorld().overworld;
        world.set(source, 'minecraft:water');

        expect(lavaWaterProduct(world.block(source), false)).toBeUndefined();
    });
});

describe('applyLavaWaterReaction', () => {
    it('turns a lava source next to water into obsidian and tells the neighbors', () => {
        const world = createVoxelWorld().overworld;
        world.set(source, 'minecraft:lava');
        world.set({ x: 1, y: 1, z: 0 }, 'minecraft:water');

        expect(applyLavaWaterReaction(world, world.block(source))).toBe('east');
        expect(world.identifierAt(source)).toBe('minecraft:obsidian');
        expect(world.sounds.map((entry) => entry.name)).toEqual(['random.fizz']);
        expect(world.notified).toEqual([source]);
    });

    it('turns flowing lava under water into stone', () => {
        const world = createVoxelWorld().overworld;
        world.set(source, 'minecraft:flowing_lava', { liquid_depth: 2 });
        world.set({ x: 0, y: 2, z: 0 }, 'minecraft:water');

        expect(applyLavaWaterReaction(world, world.block(source))).toBe('up');
        expect(world.identifierAt(source)).toBe('minecraft:stone');
    });

    it('leaves lava alone when no water touches it', () => {
        const world = createVoxelWorld().overworld;
        world.set(source, 'minecraft:lava');

        expect(applyLavaWaterReaction(world, world.block(source))).toBeUndefined();
        expect(world.identifierAt(source)).toBe('minecraft:lava');
    });
});
