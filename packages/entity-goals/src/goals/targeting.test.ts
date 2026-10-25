import { describe, expect, it } from 'vitest';

import { GoalHarness, testMob } from '../harness';
import type { GoalDamage, GoalMob, GoalWorld } from '../world';

/**
 * The targeting family, which sets and clears the entity's attack target and
 * holds no control flag while it does.
 */

/** A world that holds one target the goals may write, and records every write. */
const targetingWorld = (
    options: {
        readonly mobs?: readonly GoalMob[];
        readonly damagers?: readonly GoalDamage[];
        readonly owner?: GoalMob;
        readonly pusher?: GoalMob;
        readonly unseen?: ReadonlySet<string | number>;
    } = {}
): GoalWorld & { readonly writes: (string | undefined)[]; current(): GoalMob | undefined } => {
    let current: GoalMob | undefined;
    const writes: (string | undefined)[] = [];
    return {
        writes,
        current: () => current,
        mobs: () => options.mobs ?? [],
        damagers: () => options.damagers ?? [],
        owner: () => options.owner,
        lastPusher: () => options.pusher,
        canSee: (mob) => options.unseen?.has(mob.id) !== true,
        target: () => current,
        setTarget: (mob) => {
            current = mob;
            writes.push(mob === undefined ? undefined : String(mob.id));
        }
    };
};

describe('minecraft:behavior.nearest_attackable_target', () => {
    const body = {
        priority: 2,
        within_radius: 16,
        must_see: true,
        scan_interval: 0,
        entity_types: [{ filters: { test: 'is_family', subject: 'other', value: 'player' }, max_dist: 16 }]
    };

    it('takes the nearest mob an entity_types entry accepts', () => {
        const player = testMob('player', { x: 4, y: 0, z: 0 }, { families: ['player'] });
        const cow = testMob('cow', { x: 1, y: 0, z: 0 }, { families: ['cow'] });
        const world = targetingWorld({ mobs: [cow, player] });
        const harness = new GoalHarness({ goals: { 'minecraft:behavior.nearest_attackable_target': body }, world });

        harness.tick();

        expect(world.writes).toEqual(['player']);
        expect(harness.isRunning('minecraft:behavior.nearest_attackable_target')).toBe(true);
    });

    it('claims no control flag, so an attack goal may run beside it', () => {
        const player = testMob('player', { x: 4, y: 0, z: 0 }, { families: ['player'] });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.nearest_attackable_target': body },
            world: targetingWorld({ mobs: [player] })
        });

        harness.tick();

        expect(harness.holderOf('move')).toBeUndefined();
        expect(harness.holderOf('look')).toBeUndefined();
    });

    it('ignores a candidate outside the radius', () => {
        const player = testMob('player', { x: 40, y: 0, z: 0 }, { families: ['player'] });
        const world = targetingWorld({ mobs: [player] });
        const harness = new GoalHarness({ goals: { 'minecraft:behavior.nearest_attackable_target': body }, world });

        harness.tick();

        expect(world.writes).toEqual([]);
    });

    it('drops the target after must_see_forget_duration out of sight', () => {
        const player = testMob('player', { x: 4, y: 0, z: 0 }, { families: ['player'] });
        const world = targetingWorld({ mobs: [player], unseen: new Set(['player']) });
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.nearest_attackable_target': { ...body, must_see: false, reselect_targets: false }
            },
            world
        });

        harness.tick();
        expect(world.current()?.id).toBe('player');

        // A second scan may not replace a target it already holds.
        harness.tick();
        expect(world.writes).toEqual(['player']);
    });
});

describe('minecraft:behavior.hurt_by_target', () => {
    it('takes the last entity that damaged this one', () => {
        const zombie = testMob('zombie', { x: 2, y: 0, z: 0 });
        const skeleton = testMob('skeleton', { x: 6, y: 0, z: 0 });
        const world = targetingWorld({
            damagers: [
                { mob: skeleton, cause: 'entity_attack', total: 3 },
                { mob: zombie, cause: 'entity_attack', total: 1 }
            ]
        });
        const harness = new GoalHarness({ goals: { 'minecraft:behavior.hurt_by_target': { priority: 1 } }, world });

        harness.tick();

        expect(world.writes).toEqual(['zombie']);
    });

    it('leaves the owner alone unless hurt_owner is set', () => {
        const owner = testMob('owner', { x: 1, y: 0, z: 0 });
        const world = targetingWorld({
            owner,
            damagers: [{ mob: owner, cause: 'entity_attack', total: 2 }]
        });
        const harness = new GoalHarness({ goals: { 'minecraft:behavior.hurt_by_target': { priority: 1 } }, world });

        harness.tick();

        expect(world.writes).toEqual([]);
    });
});

describe('minecraft:behavior.owner_hurt_target', () => {
    it('joins the fight the owner started', () => {
        const victim = testMob('victim', { x: 3, y: 0, z: 0 });
        const owner = testMob('owner', { x: 1, y: 0, z: 0 }, { target: victim });
        const world = targetingWorld({ owner });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.owner_hurt_target': { priority: 1 } },
            world
        });

        harness.tick();

        expect(world.writes).toEqual(['victim']);
    });
});

describe('minecraft:behavior.owner_hurt_by_target', () => {
    it('takes whatever hurt the owner', () => {
        const attacker = testMob('attacker', { x: 3, y: 0, z: 0 });
        const owner = testMob('owner', { x: 1, y: 0, z: 0 }, { lastDamager: attacker });
        const world = targetingWorld({ owner });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.owner_hurt_by_target': { priority: 1 } },
            world
        });

        harness.tick();

        expect(world.writes).toEqual(['attacker']);
    });
});

describe('minecraft:behavior.target_when_pushed', () => {
    it('retaliates against the pusher when the chance comes up', () => {
        const pusher = testMob('pusher', { x: 1, y: 0, z: 0 });
        const world = targetingWorld({ pusher });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.target_when_pushed': { priority: 2, percent_chance: 100 } },
            world
        });

        harness.tick();

        expect(world.writes).toEqual(['pusher']);
    });

    it('does nothing when the chance is zero', () => {
        const pusher = testMob('pusher', { x: 1, y: 0, z: 0 });
        const world = targetingWorld({ pusher });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.target_when_pushed': { priority: 2, percent_chance: 0 } },
            world,
            random: () => 0.9
        });

        harness.tick();

        expect(world.writes).toEqual([]);
    });
});

describe('minecraft:behavior.wither_target_highest_damage', () => {
    it('takes whoever has dealt the most damage in total', () => {
        const low = testMob('low', { x: 2, y: 0, z: 0 });
        const high = testMob('high', { x: 9, y: 0, z: 0 });
        const world = targetingWorld({
            damagers: [
                { mob: low, cause: 'entity_attack', total: 4 },
                { mob: high, cause: 'entity_attack', total: 11 }
            ]
        });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.wither_target_highest_damage': { priority: 1 } },
            world
        });

        harness.tick();

        expect(world.writes).toEqual(['high']);
    });
});
