import { describe, expect, it } from 'vitest';

import { Brain } from '../brain.js';
import { MemoryModuleTypes } from '../memory.js';
import { TestWorld } from '../testWorld.js';
import type { BlockPos } from '../world.js';
import { interactWithDoor } from './common.js';

/**
 * Java's `InteractWithDoor`: a mob opens a closed `#mob_interactable_doors` door at the node it last
 * left or the one it walks to, and closes each door it opened once it has passed it, while it is
 * within 3 blocks of it and no mob of its type stands within 2.
 */

const DOOR: BlockPos = { x: 2, y: 0, z: 0 };

/** A villager on a path along x with a closed oak door at x 2. */
const walker = () => {
    const world = new TestWorld();
    world.doors.set('2,0,0', false);
    world.blockTags.set('2,0,0', new Set(['minecraft:mob_interactable_doors']));
    const mob = world.spawn('minecraft:villager', { x: 1.5, y: 0, z: 0.5 });
    mob.attach(new Brain({ memories: [...Object.values(MemoryModuleTypes)], sensors: [], activities: [] }));
    return { world, mob, behavior: interactWithDoor() };
};

/** Puts the mob at a point of its path, walking from one node to the next. */
const at = (mob: ReturnType<typeof walker>['mob'], x: number, previous: number, next: number): void => {
    mob.position = { x, y: 0, z: 0.5 };
    mob.navigation.step = { previous: { x: previous, y: 0, z: 0 }, next: { x: next, y: 0, z: 0 } };
};

describe('InteractWithDoor', () => {
    it('opens the door on its next node and closes it once it has passed it', () => {
        const { world, mob, behavior } = walker();
        at(mob, 1.5, 1, 2);
        expect(behavior.tryStart(mob.context, 0)).toBe(true);
        expect(world.doors.get('2,0,0')).toBe(true);
        expect(mob.brain.getMemory(MemoryModuleTypes.DOORS_TO_CLOSE)).toEqual([
            { dimension: world.dimension, pos: DOOR }
        ]);

        // Through the door: it stays open while the door is one of the two nodes.
        at(mob, 2.5, 2, 3);
        behavior.tryStart(mob.context, 1);
        expect(world.doors.get('2,0,0')).toBe(true);

        // Java rechecks a node 20 ticks after it last saw the node change.
        at(mob, 3.5, 3, 4);
        for (let tick = 2; tick < 40 && world.doors.get('2,0,0') === true; tick += 1)
            behavior.tryStart(mob.context, tick);
        expect(world.doors.get('2,0,0')).toBe(false);
        // Java's Brain erases a memory set to an empty collection.
        expect(mob.brain.getMemory(MemoryModuleTypes.DOORS_TO_CLOSE)).toBeUndefined();
    });

    it('forgets a door 3 blocks behind it, and holds one open for a mob of its type beside it', () => {
        const far = walker();
        at(far.mob, 1.5, 1, 2);
        far.behavior.tryStart(far.mob.context, 0);
        at(far.mob, 6.5, 6, 7);
        for (let tick = 1; tick < 40; tick += 1) far.behavior.tryStart(far.mob.context, tick);
        expect(far.world.doors.get('2,0,0')).toBe(true);
        expect(far.mob.brain.getMemory(MemoryModuleTypes.DOORS_TO_CLOSE)).toBeUndefined();

        const held = walker();
        at(held.mob, 1.5, 1, 2);
        held.behavior.tryStart(held.mob.context, 0);
        const other = held.world.spawn('minecraft:villager', { x: 1.5, y: 0, z: 0.5 });
        held.mob.brain.setMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES, [other]);
        at(held.mob, 3.5, 3, 4);
        for (let tick = 1; tick < 40; tick += 1) held.behavior.tryStart(held.mob.context, tick);
        expect(held.world.doors.get('2,0,0')).toBe(true);
    });

    it('does nothing without a path under way', () => {
        const { world, mob, behavior } = walker();
        expect(behavior.tryStart(mob.context, 0)).toBe(false);
        expect(world.doors.get('2,0,0')).toBe(false);
    });
});
