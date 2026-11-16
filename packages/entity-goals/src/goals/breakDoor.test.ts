import type { EntityPosition } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { GoalHarness, testMob } from '../harness';
import { voxelGrid } from '../navigation/voxelGrid';
import type { GoalWorld } from '../world';

/**
 * `minecraft:annotation.break_door`, Java's `BreakDoorGoal`: a mob whose path a closed wooden door
 * blocks beats on it and breaks it after 240 goal ticks, on a difficulty its predicate accepts and
 * with `mobGriefing` on.
 */

/** A corridor along x with a closed oak door at x 2, both halves, and the floor under it. */
const corridor = voxelGrid([['#######'], ['..D....'], ['..D....']]);

/** The same corridor once the door is broken. */
const opened = voxelGrid([['#######'], ['.......'], ['.......']]);

/** The door's upper half, which Java's `DoorInteractGoal` names: a path node's y plus one. */
const DOOR = { x: 2, y: 2, z: 0 };

interface DoorWorld extends GoalWorld {
    readonly broken: EntityPosition[];
    readonly stages: number[];
}

/** A world whose mob is stuck against the door and chasing a target past it. */
const doorWorld = (gameRules: Readonly<Record<string, boolean>> = {}): DoorWorld => {
    const target = testMob('target', { x: 5.5, y: 1, z: 0.5 });
    const broken: EntityPosition[] = [];
    const stages: number[] = [];
    return {
        broken,
        stages,
        navigation: () => (broken.length === 0 ? corridor : opened),
        target: () => target,
        setTarget: () => undefined,
        mobs: () => [target],
        canSee: () => false,
        gameRule: (name) => gameRules[name],
        horizontalCollision: () => true,
        breakDoor: (position) => broken.push(position),
        doorBreakProgress: (_position, stage) => stages.push(stage)
    };
};

/** A door breaker behind the door, chasing its target with `melee_box_attack`, on a difficulty. */
const breaker = (difficulty: string, world: DoorWorld, minDifficulty?: string): GoalHarness => {
    const harness = new GoalHarness({
        components: {
            'minecraft:navigation.walk': { can_break_doors: true },
            // A zombie's box, so its path is one block wide as Java's floor(width + 1) makes it.
            'minecraft:collision_box': { width: 0.6, height: 1.95 }
        },
        goals: {
            'minecraft:annotation.break_door': minDifficulty === undefined ? {} : { min_difficulty: minDifficulty },
            'minecraft:behavior.melee_box_attack': { priority: 2, track_target: true }
        },
        world,
        worldFacts: { difficulty: () => difficulty },
        // Pressed against the door's near side, as a mob its collision stopped stands.
        at: { x: 1.7, y: 1, z: 0.5 }
    });
    harness.actuator.follow = false;
    return harness;
};

describe('minecraft:annotation.break_door', () => {
    it('breaks the door in its path after 240 goal ticks on hard, with the cracks shown and taken away', () => {
        const world = doorWorld();
        const harness = breaker('hard', world);
        let ticks = 0;
        while (world.broken.length === 0 && ticks < 1000) {
            harness.tick();
            ticks += 1;
        }
        expect(world.broken).toEqual([DOOR]);
        // Each harness tick is a full selector tick: one to find the door, then 240 of beating on
        // it. The runtime runs the selector every other game tick, as Java's `Mob.serverAiStep`
        // does, so in game ticks the break takes 480.
        expect(ticks).toBe(241);
        expect(world.stages[0]).toBe(0);
        expect(world.stages).toContain(9);
        harness.tick(4);
        expect(world.stages.at(-1)).toBe(-1);
    });

    it('leaves the door below its minimum difficulty or with mobGriefing off', () => {
        const normal = doorWorld();
        breaker('normal', normal).tick(1000);
        expect(normal.broken).toEqual([]);

        const peaceful = doorWorld({ mobGriefing: false });
        breaker('hard', peaceful).tick(1000);
        expect(peaceful.broken).toEqual([]);

        const raider = doorWorld();
        breaker('normal', raider, 'normal').tick(300);
        expect(raider.broken[0]).toEqual(DOOR);
    });

    it('does not start when nothing stops it at the door', () => {
        const world: DoorWorld = { ...doorWorld(), horizontalCollision: () => false };
        breaker('hard', world).tick(1000);
        expect(world.broken).toEqual([]);
    });
});
