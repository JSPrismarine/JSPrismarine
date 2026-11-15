import { describe, expect, it } from 'vitest';

import { createVoxelWorld } from '../voxelWorld';
import {
    applyLavaWaterReaction,
    depthStep,
    fluidNeighborChanged,
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

    it("washes a block away by Bedrock's reaction when the host names no rule", () => {
        const world = createVoxelWorld().overworld;
        floorUnder(world);
        world.set(source, 'minecraft:water');
        world.set({ x: 1, y: 1, z: 0 }, 'minecraft:torch');

        expect(spreadLiquid(world, world.block(source)).sides).toContain('east');
        expect(world.identifierAt({ x: 1, y: 1, z: 0 })).toBe('minecraft:flowing_water');
    });

    it("leaves a block the host's rule says dams the water", () => {
        const world = Object.assign(createVoxelWorld().overworld, {
            liquidReactionOf: (block: { identifier: string }) =>
                block.identifier === 'minecraft:torch' ? ('blocking' as const) : undefined
        });
        floorUnder(world);
        world.set(source, 'minecraft:water');
        world.set({ x: 1, y: 1, z: 0 }, 'minecraft:torch');

        expect(spreadLiquid(world, world.block(source)).sides).not.toContain('east');
        expect(world.identifierAt({ x: 1, y: 1, z: 0 })).toBe('minecraft:torch');
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

describe('water held by a waterlogged block', () => {
    const SLAB = 'minecraft:stone_block_slab';

    /**
     * A world whose stone is the only full cube, which is what the server's light-dampening rule
     * answers for a slab: the double's own fallback would call a slab a cube and wall its water in.
     */
    const slabWorld = () => {
        const world = createVoxelWorld().overworld;
        floorUnder(world);
        return Object.assign(world, {
            isFullCube: (block: { identifier: string }) => block.identifier === 'minecraft:stone'
        });
    };

    it('spreads its water into the air beside it as a source does', () => {
        const world = slabWorld();
        world.set(source, SLAB);
        world.setLiquid(source, 'minecraft:water');

        const result = spreadLiquid(world, { ...world.block(source), identifier: 'minecraft:water', states: {} });

        expect(result.sides).toEqual(['north', 'south', 'west', 'east']);
        expect(world.identifierAt({ x: 1, y: 1, z: 0 })).toBe('minecraft:flowing_water');
        expect(world.stateAt({ x: 1, y: 1, z: 0 }, 'liquid_depth')).toBe(1);
        // The block keeps its own place; only the air around it took water.
        expect(world.identifierAt(source)).toBe(SLAB);
    });

    it('is not entered or replaced by flowing water beside it', () => {
        const world = slabWorld();
        world.set(source, 'minecraft:water');
        world.set({ x: 1, y: 1, z: 0 }, SLAB);
        world.setLiquid({ x: 1, y: 1, z: 0 }, 'minecraft:water');

        const result = spreadLiquid(world, world.block(source));

        expect(result.sides).not.toContain('east');
        expect(world.identifierAt({ x: 1, y: 1, z: 0 })).toBe(SLAB);
    });

    it('counts as a source neighbor, so it feeds the water beside it', () => {
        const world = slabWorld();
        const between = { x: 1, y: 1, z: 0 };
        world.set(source, SLAB);
        world.setLiquid(source, 'minecraft:water');
        world.set({ x: 2, y: 1, z: 0 }, 'minecraft:water');
        world.set(between, 'minecraft:flowing_water', { liquid_depth: 1 });

        // Two sources beside it over solid ground: Java's `getNewLiquid` makes it a source too.
        spreadLiquid(world, world.block(between));

        expect(world.identifierAt(between)).toBe('minecraft:water');
    });

    it('schedules its water when a neighbor changes', () => {
        const world = slabWorld();
        world.set(source, SLAB);
        world.setLiquid(source, 'minecraft:water');

        fluidNeighborChanged(world, { ...world.block(source), identifier: 'minecraft:water', states: {} });

        expect(world.scheduled).toEqual([{ position: source, delay: WATER_SPREAD_TICKS }]);
    });

    it('turns lava beside it into obsidian', () => {
        const world = slabWorld();
        world.set({ x: 1, y: 1, z: 0 }, SLAB);
        world.setLiquid({ x: 1, y: 1, z: 0 }, 'minecraft:water');
        world.set(source, 'minecraft:lava');

        expect(applyLavaWaterReaction(world, world.block(source))).toBe('east');
        expect(world.identifierAt(source)).toBe('minecraft:obsidian');
    });
});
