import { describe, expect, it } from 'vitest';

import { Activities } from '../activity.js';
import { activityData, Brain } from '../brain.js';
import { MemoryModuleTypes } from '../memory.js';
import { blockPosTracker } from '../world.js';
import { TestMob, TestWorld } from '../testWorld.js';
import { moveToTargetSink } from './common.js';

/** A mob whose brain runs only `MoveToTargetSink`, walking to a block it was given. */
const walkerTo = (target: { x: number; y: number; z: number }) => {
    const world = new TestWorld({ gameTime: 100 });
    const mob = new TestMob(world, 'minecraft:villager', { position: { x: 0.5, y: 0, z: 0.5 } });
    mob.attach(new Brain({ sensors: [], activities: [activityData(Activities.CORE, [[0, moveToTargetSink()]])] }));
    mob.brain.setMemory(MemoryModuleTypes.WALK_TARGET, {
        target: blockPosTracker(target),
        speedModifier: 0.5,
        closeEnoughDist: 1
    });
    return { world, mob };
};

describe("Java's MoveToTargetSink", () => {
    it('walks a path that ends short of its target, and records that it cannot reach it', () => {
        const { mob } = walkerTo({ x: 8, y: 0, z: 0 });
        const goal = { x: 8.5, y: 0, z: 0.5 };
        mob.navigation.unreachable.push(goal);
        mob.navigation.approachable.push(goal);

        mob.brain.tick(mob.context);

        expect(mob.navigation.lastMove?.target).toEqual(goal);
        expect(mob.brain.getMemory(MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE)).toBe(100);
    });

    it('drops a walk target nothing takes it any closer to', () => {
        const { mob } = walkerTo({ x: 8, y: 0, z: 0 });
        mob.navigation.unreachable.push({ x: 8.5, y: 0, z: 0.5 });

        mob.brain.tick(mob.context);

        expect(mob.navigation.moves).toEqual([]);
        expect(mob.brain.getMemory(MemoryModuleTypes.WALK_TARGET)).toBeUndefined();
        expect(mob.brain.getMemory(MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE)).toBe(100);
    });

    it('clears the record of an unreachable target once a path reaches it', () => {
        const { mob } = walkerTo({ x: 8, y: 0, z: 0 });
        mob.brain.setMemory(MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE, 40);

        mob.brain.tick(mob.context);

        expect(mob.navigation.lastMove?.target).toEqual({ x: 8.5, y: 0, z: 0.5 });
        expect(mob.brain.getMemory(MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE)).toBeUndefined();
    });
});
