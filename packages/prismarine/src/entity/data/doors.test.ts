import { describe, expect, it } from 'vitest';

import { doorBreakEvents, isDoor, removeDoor, setDoorOpen } from './doors';
import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

const LOWER = { x: 3, y: FLOOR_Y + 1, z: 0 };
const UPPER = { x: 3, y: FLOOR_Y + 2, z: 0 };

/** A world with a closed oak door, its two halves as Bedrock stores them. */
const withDoor = (identifier = 'minecraft:wooden_door') => {
    const world = new TestEntityWorld();
    world.world.blocks.set(LOWER, { identifier, states: { open_bit: false, upper_block_bit: false } }, true);
    world.world.blocks.set(UPPER, { identifier, states: { open_bit: false, upper_block_bit: true } }, true);
    return world;
};

describe('doors', () => {
    it('tells a door from a trapdoor', () => {
        expect(isDoor('minecraft:wooden_door')).toBe(true);
        expect(isDoor('minecraft:iron_door')).toBe(true);
        expect(isDoor('minecraft:spruce_trapdoor')).toBe(false);
    });

    it('opens and closes a door from either half by writing its lower half', () => {
        const world = withDoor();
        setDoorOpen(world.world.blocks, UPPER, true);
        expect(world.world.blocks.get(LOWER)?.states['open_bit']).toBe(true);
        expect(world.world.blocks.get(UPPER)?.states['open_bit']).toBe(false);

        setDoorOpen(world.world.blocks, LOWER, false);
        expect(world.world.blocks.get(LOWER)?.states['open_bit']).toBe(false);
    });

    it('leaves a block that is no door alone', () => {
        const world = new TestEntityWorld();
        world.setBlock(LOWER, 'minecraft:stone');
        setDoorOpen(world.world.blocks, LOWER, true);
        expect(world.world.blocks.get(LOWER)).toEqual({ identifier: 'minecraft:stone', states: {} });
    });

    it('shows the path finder each half of a door, open or closed, and whether it is iron', () => {
        const world = withDoor();
        const { runtime } = entityFixture(world);
        expect(runtime.navigation().doorAt?.(UPPER)).toEqual({ open: false, iron: false });

        setDoorOpen(world.world.blocks, LOWER, true);
        runtime.tick(1);
        expect(runtime.navigation().doorAt?.(UPPER)).toEqual({ open: true, iron: false });
        expect(runtime.navigation().doorAt?.({ x: 4, y: LOWER.y, z: 0 })).toBeUndefined();

        const iron = withDoor('minecraft:iron_door');
        expect(entityFixture(iron).runtime.navigation().doorAt?.(LOWER)).toEqual({ open: false, iron: true });
    });

    it('breaks both halves of a door from either half, and nothing that is no door', () => {
        const world = withDoor();
        expect(removeDoor(world.world.blocks, UPPER)).toBeTypeOf('number');
        expect(world.world.blocks.get(LOWER)?.identifier).toBe('minecraft:air');
        expect(world.world.blocks.get(UPPER)?.identifier).toBe('minecraft:air');
        expect(world.drops).toEqual([]);

        world.setBlock(LOWER, 'minecraft:stone');
        expect(removeDoor(world.world.blocks, LOWER)).toBeUndefined();
        expect(world.world.blocks.get(LOWER)?.identifier).toBe('minecraft:stone');
    });

    it("sends a door breaker's knock, cracks and crash as Bedrock level events", () => {
        const events: { event: number; data: number }[] = [];
        const sink = (_at: unknown, event: number, data: number) => void events.push({ event, data });
        doorBreakEvents.knock(sink, UPPER);
        doorBreakEvents.progress(sink, UPPER, 0);
        doorBreakEvents.progress(sink, UPPER, 5);
        doorBreakEvents.progress(sink, UPPER, -1);
        doorBreakEvents.crash(sink, UPPER, 42);
        // SOUND_ZOMBIE_WOODEN_DOOR, START_BLOCK_CRACKING at 65535 over 240 ticks, STOP_BLOCK_CRACKING,
        // SOUND_ZOMBIE_DOOR_CRASH and PARTICLES_DESTROY_BLOCK with the door's runtime id.
        expect(events).toEqual([
            { event: 1010, data: 0 },
            { event: 3600, data: 273 },
            { event: 3601, data: 0 },
            { event: 1012, data: 0 },
            { event: 2001, data: 42 }
        ]);
    });
});
