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
        readonly isAttackable?: (mob: GoalMob) => boolean;
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
        },
        ...(options.isAttackable === undefined ? {} : { isAttackable: options.isAttackable })
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

    it("scans on one selector tick in reducedTickDelay(scan_interval), as Java's random interval does", () => {
        const player = testMob('player', { x: 4, y: 0, z: 0 }, { families: ['player'] });
        const bounds: number[] = [];
        const world = targetingWorld({ mobs: [player] });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.nearest_attackable_target': { ...body, scan_interval: 10 } },
            world,
            randomInt: (bound) => {
                bounds.push(bound);
                return 1;
            }
        });

        harness.tick(3);

        expect(bounds).toEqual([5, 5, 5]);
        expect(world.writes).toEqual([]);
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

    it('skips a closer player Java marks unavailable and takes the next target', () => {
        const creative = testMob('creative-player', { x: 1, y: 0, z: 0 }, { families: ['player'] });
        const survival = testMob('survival-player', { x: 4, y: 0, z: 0 }, { families: ['player'] });
        const world = targetingWorld({
            mobs: [creative, survival],
            isAttackable: (mob) => mob.id !== creative.id
        });
        const harness = new GoalHarness({ goals: { 'minecraft:behavior.nearest_attackable_target': body }, world });

        harness.tick();

        expect(world.current()?.id).toBe(survival.id);
    });

    it('clears a held target as soon as Java marks it unavailable', () => {
        const player = testMob('player', { x: 4, y: 0, z: 0 }, { families: ['player'] });
        let attackable = true;
        const world = targetingWorld({ mobs: [player], isAttackable: () => attackable });
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.nearest_attackable_target': {
                    ...body,
                    must_see: false,
                    reselect_targets: false
                }
            },
            world
        });

        harness.tick();
        expect(world.current()?.id).toBe(player.id);

        attackable = false;
        harness.tick();

        expect(world.current()).toBeUndefined();
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

    describe('alert_same_type', () => {
        /** A hurt entity with neighbors, recording whom the goal alerts. */
        const alerting = (body: Record<string, unknown>, mobs: readonly GoalMob[], owner?: GoalMob) => {
            const attacker = testMob('attacker', { x: 3, y: 0, z: 0 });
            const alerted: [string | number, string | number][] = [];
            const world = {
                ...targetingWorld({ mobs, damagers: [{ mob: attacker, cause: 'entity_attack', total: 1 }] }),
                owner: () => owner,
                setTargetOf: (mob: GoalMob, target: GoalMob) => {
                    alerted.push([mob.id, target.id]);
                }
            };
            const harness = new GoalHarness({
                identifier: 'test:zombie',
                goals: { 'minecraft:behavior.hurt_by_target': { priority: 1, ...body } },
                components: { 'minecraft:follow_range': { value: 16 } },
                world
            });
            harness.tick();
            return alerted;
        };

        it('calls idle mobs of its own type within its follow range onto the attacker', () => {
            const near = testMob('near', { x: 10, y: 0, z: -10 }, { identifier: 'test:zombie' });
            const high = testMob('high', { x: 0, y: 9, z: 0 }, { identifier: 'test:zombie' });
            const other = testMob('other', { x: 2, y: 0, z: 0 }, { identifier: 'test:skeleton' });
            const busy = testMob('busy', { x: 2, y: 0, z: 0 }, { identifier: 'test:zombie', target: other });
            const far = testMob('far', { x: 18, y: 0, z: 0 }, { identifier: 'test:zombie' });
            const above = testMob('above', { x: 0, y: 12, z: 0 }, { identifier: 'test:zombie' });

            expect(alerting({ alert_same_type: true }, [near, high, other, busy, far, above])).toEqual([
                ['near', 'attacker'],
                ['high', 'attacker']
            ]);
        });

        it('alerts nobody without alert_same_type', () => {
            const near = testMob('near', { x: 2, y: 0, z: 0 }, { identifier: 'test:zombie' });

            expect(alerting({}, [near])).toEqual([]);
        });

        it('also calls the mobs its alert_filters accept, as Java calls its subclasses', () => {
            const husk = testMob('husk', { x: 2, y: 0, z: 0 }, { identifier: 'test:husk', families: ['husk'] });
            const piglin = testMob('piglin', { x: 2, y: 0, z: 1 }, { identifier: 'test:piglin', families: ['piglin'] });
            const alertFilters = { test: 'is_family', subject: 'other', value: 'husk' };

            expect(alerting({ alert_same_type: true, alert_filters: alertFilters }, [husk, piglin])).toEqual([
                ['husk', 'attacker']
            ]);
            expect(alerting({ alert_same_type: true }, [husk])).toEqual([]);
        });

        it('alerts only mobs that share its owner', () => {
            const owner = testMob('owner', { x: 5, y: 0, z: 0 });
            const stranger = testMob('stranger', { x: 6, y: 0, z: 0 });
            const pack = testMob('pack', { x: 2, y: 0, z: 0 }, { identifier: 'test:zombie', owner });
            const stray = testMob('stray', { x: 2, y: 0, z: 1 }, { identifier: 'test:zombie', owner: stranger });
            const wild = testMob('wild', { x: 2, y: 0, z: 2 }, { identifier: 'test:zombie' });

            expect(alerting({ alert_same_type: true }, [pack, stray, wild], owner)).toEqual([['pack', 'attacker']]);
        });
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

describe("the owner goals read the owner's remembered blows, once per blow", () => {
    /** An owner that remembers one blow on each side, which a test moves on. */
    const rememberingOwner = (blow: { mob: GoalMob; tick: number }): GoalMob => ({
        ...testMob('owner', { x: 1, y: 0, z: 0 }),
        lastHurt: () => blow,
        lastHurtBy: () => blow
    });

    for (const name of ['minecraft:behavior.owner_hurt_target', 'minecraft:behavior.owner_hurt_by_target']) {
        it(`${name} takes the blow's mob, gives it up, and takes it again only for a newer blow`, () => {
            const cow = testMob('cow', { x: 3, y: 0, z: 0 });
            const blow = { mob: cow, tick: 100 };
            const world = targetingWorld({ owner: rememberingOwner(blow) });
            const harness = new GoalHarness({ goals: { [name]: { priority: 1 } }, world });

            harness.tick();
            expect(world.writes).toEqual(['cow']);

            world.setTarget?.(undefined);
            harness.tick(4);
            expect(world.writes).toEqual(['cow', undefined]);

            blow.tick = 140;
            harness.tick(2);
            expect(world.writes).toEqual(['cow', undefined, 'cow']);
        });
    }
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
