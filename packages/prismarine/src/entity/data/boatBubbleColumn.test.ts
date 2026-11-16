import { describe, expect, it } from 'vitest';

import { BUBBLE_TIME } from './boatBubbleColumn';
import type { DataEntity } from './DataEntity';
import { BlockPalette, BlockStateModel } from '@jsprismarine/blocks';

import { definitionOf } from '../../content/ContentOptions';
import { entityFixture, entityFixturePalette, entityFixtureStack, FLOOR_Y, TestEntityWorld } from './testing';

/** The pool's floor, its surface, and the column's x and z. */
const GROUND = FLOOR_Y + 1;
const DEPTH = 4;
const SURFACE = GROUND + DEPTH;

const BOAT = {
    components: {
        'minecraft:physics': {},
        'minecraft:type_family': { family: ['boat', 'inanimate'] },
        'minecraft:collision_box': { width: 1.4, height: 0.455 },
        'minecraft:buoyant': { base_buoyancy: 1, liquid_blocks: ['minecraft:water', 'minecraft:flowing_water'] },
        'minecraft:rideable': { seat_count: 1, seats: [{ position: [0, 0, 0] }] }
    }
};

const PIG = {
    components: { 'minecraft:health': { value: 10, max: 10 }, 'minecraft:collision_box': { width: 0.9, height: 0.9 } }
};

/** A block file with no collision, as the pack's water and bubble column have none. */
const passable = (identifier: string) =>
    definitionOf('blocks', identifier, {
        format_version: '1.26.20',
        'minecraft:block': {
            description: { identifier },
            components: { 'minecraft:collision_box': false, 'minecraft:light_dampening': 0 }
        }
    });

/** The fixture's palette with water's depth and the bubble column's direction. */
const palette = (): BlockPalette =>
    new BlockPalette([
        ...entityFixturePalette().entries.map((entry) => [entry.identifier, entry.model] as const),
        [
            'minecraft:water',
            new BlockStateModel([
                {
                    name: 'liquid_depth',
                    type: 'int',
                    values: Array.from({ length: 16 }, (_, depth) => depth),
                    defaultValue: 0
                }
            ])
        ],
        [
            'minecraft:bubble_column',
            new BlockStateModel([{ name: 'drag_down', type: 'bool', values: [false, true], defaultValue: false }])
        ]
    ]);

/**
 * A boat floating on a pool of water with a bubble column up its middle to the surface, dragging
 * down or rising.
 */
const boatOverColumn = (dragDown: boolean) => {
    const world = new TestEntityWorld();
    for (let x = -2; x <= 2; x += 1)
        for (let z = -2; z <= 2; z += 1)
            for (let y = GROUND; y < SURFACE; y += 1)
                world.world.blocks.set(
                    { x, y, z },
                    x === 0 && z === 0
                        ? { identifier: 'minecraft:bubble_column', states: { drag_down: dragDown } }
                        : { identifier: 'minecraft:water', states: { liquid_depth: 0 } },
                    false
                );
    const extra = { 'minecraft:boat': BOAT, 'minecraft:pig': PIG };
    const stack = entityFixtureStack(extra);
    const fixture = entityFixture(
        world,
        {
            load: () => ({
                definitions: {
                    ...stack,
                    blocks: new Map([
                        ...stack.blocks,
                        ['minecraft:water', passable('minecraft:water')],
                        ['minecraft:bubble_column', passable('minecraft:bubble_column')]
                    ])
                },
                diagnostics: []
            }),
            blockPalette: palette()
        },
        extra
    );
    // Afloat from the first tick: `AbstractBoat.floatBoat` sets a boat 0.101 under its top into the water.
    const boat = fixture.runtime.spawn('minecraft:boat', { x: 0.5, y: SURFACE - 0.455 + 0.101, z: 0.5 });
    if (boat === undefined) throw new Error('the fixture declares no boat');
    return { runtime: fixture.runtime, boat };
};

/** Ticks the runtime and records the boat's height after each tick. */
const heights = (runtime: { tick(tick: number): void }, boat: DataEntity, ticks: number): number[] => {
    const seen: number[] = [];
    for (let tick = 1; tick <= ticks; tick += 1) {
        runtime.tick(tick);
        seen.push(boat.position.y);
    }
    return seen;
};

/** The first tick, counted from 1, whose height is past `limit` from the floating height. */
const firstPast = (seen: readonly number[], limit: number): number =>
    seen.findIndex((y, index) => index >= 5 && Math.abs(y - (seen[4] ?? y)) > limit) + 1;

describe('a boat over a bubble column', () => {
    it("floats on a sinking column for Java's 60 ticks, then is dragged under and drops its rider", () => {
        const { runtime, boat } = boatOverColumn(true);
        const pig = runtime.spawn('minecraft:pig', boat.position);
        const seat = runtime.mobById(boat.id);
        if (pig === undefined || seat === undefined) throw new Error('the fixture declares no pig');
        runtime.mount(pig.body, seat);

        const seen = heights(runtime, boat, BUBBLE_TIME + 20);
        const sank = firstPast(seen, 0.3);

        // The count starts on the first tick and runs out on the 60th, which the next tick's move shows.
        expect(sank).toBeGreaterThanOrEqual(BUBBLE_TIME);
        expect(sank).toBeLessThanOrEqual(BUBBLE_TIME + 2);
        expect(seen.at(-1)).toBeLessThan((seen[4] ?? 0) - 0.3);
        expect(runtime.ridersOf(boat.body)).toHaveLength(0);
    });

    it("floats on a rising column for Java's 60 ticks, then is thrown up", () => {
        const { runtime, boat } = boatOverColumn(false);
        const seen = heights(runtime, boat, BUBBLE_TIME + 20);
        const thrown = firstPast(seen, 0.3);

        expect(thrown).toBeGreaterThanOrEqual(BUBBLE_TIME);
        expect(thrown).toBeLessThanOrEqual(BUBBLE_TIME + 2);
        expect(Math.max(...seen)).toBeGreaterThan((seen[4] ?? 0) + 0.3);
    });
});
