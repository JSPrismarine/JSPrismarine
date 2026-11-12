import { describe, expect, it } from 'vitest';

import type { ChangeEntry } from '../../world/changelog/ChangeEntry';
import type { DamageIntent } from './damagePipeline';
import { PASS, VETO, replaceAmount } from './damagePipeline';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';
import { beginMeasuredTick } from '../../testing/changeTicks.test.helper';
import { SHIPPED_PLAYER } from '../../testing/storePlayer.test.helper';
import { PLAYER_IDENTIFIER } from '../playerOverlay';

const GROUND = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/** A mob with health, a sensor that refuses lightning and a hazard that hurts it every tick. */
const HAZARDED = {
    'jsprismarine:hazarded': {
        components: {
            'minecraft:collision_box': { width: 0.6, height: 1.8 },
            'minecraft:health': { value: 4, max: 4 },
            'minecraft:physics': {},
            'minecraft:hurt_on_condition': {
                damage_conditions: [{ cause: 'drowning', damage_per_tick: 1 }]
            }
        }
    },
    'jsprismarine:sensing': {
        components: {
            'minecraft:collision_box': { width: 0.6, height: 1.8 },
            'minecraft:health': { value: 10, max: 10 },
            'minecraft:physics': {},
            'minecraft:damage_sensor': {
                triggers: [{ cause: 'lightning', deals_damage: false, on_damage: { event: 'jsprismarine:struck' } }]
            }
        },
        component_groups: { struck: { 'minecraft:is_shaking': {} } },
        events: { 'jsprismarine:struck': { add: { component_groups: ['struck'] } } }
    }
};

const blow = (target: number, amount: number, overrides: Partial<DamageIntent> = {}): DamageIntent => ({
    target,
    cause: 'entity_attack',
    amount,
    source: { route: 'mob_attack' },
    ...overrides
});

/** Runs some work inside one open tick of the store's log and answers the entries it appended. */
const logged = (store: ReturnType<typeof entityFixture>['runtime']['store'], work: () => void): ChangeEntry[] => {
    beginMeasuredTick(store);
    work();
    return [...(store.sealTick()?.entries ?? [])];
};

describe('the damage pipeline', () => {
    describe('a veto', () => {
        it('at a pack guard stops compute and commit and logs only a rejection', () => {
            const { runtime } = entityFixture();
            const cow = runtime.spawn('minecraft:cow', GROUND);
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            cow.body.invulnerable = true;

            let outcome: ReturnType<typeof runtime.damage> | undefined;
            const entries = logged(runtime.store, () => (outcome = runtime.damage(blow(cow.id, 3))));

            expect(outcome).toMatchObject({ committed: false, rejectedBy: 'invulnerable', stage: 'pack' });
            expect(cow.instance.attributes.get('health')?.current).toBe(10);
            expect(entries).toEqual([
                {
                    kind: 'occurrence',
                    occurrence: 'action-rejected',
                    data: { action: 'damage', entity: BigInt(cow.id), guard: 'invulnerable' }
                }
            ]);
        });

        it('at the game-rule stage stops compute and commit and logs only a rejection', () => {
            const { runtime } = entityFixture(new TestEntityWorld({ gameRules: { fireDamage: false } }));
            const cow = runtime.spawn('minecraft:cow', GROUND);
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');

            let outcome: ReturnType<typeof runtime.damage> | undefined;
            const entries = logged(
                runtime.store,
                () => (outcome = runtime.damage(blow(cow.id, 1, { cause: 'fire_tick', source: { route: 'fire' } })))
            );

            expect(outcome).toMatchObject({ committed: false, rejectedBy: 'fire_damage', stage: 'game_rule' });
            expect(cow.instance.attributes.get('health')?.current).toBe(10);
            expect(entries.map((entry) => entry.kind)).toEqual(['occurrence']);
        });

        it('at a before-hook stops compute and commit and logs only a rejection', () => {
            const { runtime } = entityFixture();
            const cow = runtime.spawn('minecraft:cow', GROUND);
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            const seen: number[] = [];
            runtime.damagePipeline.addBeforeHook('test', (intent) => {
                seen.push(intent.amount);
                return VETO;
            });

            let outcome: ReturnType<typeof runtime.damage> | undefined;
            const entries = logged(runtime.store, () => (outcome = runtime.damage(blow(cow.id, 3))));

            expect(seen).toEqual([3]);
            expect(outcome).toMatchObject({ committed: false, rejectedBy: 'test', stage: 'before_hook' });
            expect(cow.instance.attributes.get('health')?.current).toBe(10);
            expect(cow.body.damage.last()).toBeUndefined();
            expect(entries).toHaveLength(1);
        });

        it('still runs the next before-hook when one removes itself', () => {
            const { runtime } = entityFixture();
            const cow = runtime.spawn('minecraft:cow', GROUND);
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            const asked: string[] = [];
            const removeOnce = runtime.damagePipeline.addBeforeHook('once', () => {
                asked.push('once');
                removeOnce();
                return PASS;
            });
            runtime.damagePipeline.addBeforeHook('veto', () => {
                asked.push('veto');
                return VETO;
            });

            expect(runtime.damage(blow(cow.id, 3))).toMatchObject({ committed: false, rejectedBy: 'veto' });
            expect(runtime.damage(blow(cow.id, 3))).toMatchObject({ committed: false, rejectedBy: 'veto' });

            expect(asked).toEqual(['once', 'veto', 'veto']);
            expect(cow.instance.attributes.get('health')?.current).toBe(10);
        });

        it('runs no before-hook once a pack guard has vetoed', () => {
            const { runtime } = entityFixture();
            const cow = runtime.spawn('minecraft:cow', GROUND);
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            cow.body.invulnerable = true;
            let asked = 0;
            runtime.damagePipeline.addBeforeHook('test', () => {
                asked += 1;
                return PASS;
            });

            runtime.damage(blow(cow.id, 3));

            expect(asked).toBe(0);
        });
    });

    it('commits the amount a before-hook replaced', () => {
        const { runtime } = entityFixture();
        const cow = runtime.spawn('minecraft:cow', GROUND);
        if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
        runtime.damagePipeline.addBeforeHook('halve', (intent) => replaceAmount(intent.amount / 2));

        const outcome = runtime.damage(blow(cow.id, 6));

        expect(outcome).toMatchObject({ committed: true, taken: 3 });
        expect(cow.instance.attributes.get('health')?.current).toBe(7);
        expect(cow.body.damage.last()?.total).toBe(3);
    });

    it('applies armor-like modifiers only to blows that keep the legacy rules', () => {
        const { runtime } = entityFixture();
        const cow = runtime.spawn('minecraft:cow', GROUND);
        if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
        cow.body.statusEffects.set('minecraft:resistance', {
            id: 'minecraft:resistance',
            amplifier: 1,
            durationTicks: 100,
            ambient: false,
            showParticles: true,
            showIcon: true
        });

        const bite = runtime.damage(blow(cow.id, 2));
        const swing = runtime.damage(blow(cow.id, 5, { cause: 'attack', source: { route: 'melee', mitigated: true } }));

        expect(bite).toMatchObject({ committed: true, taken: 2 });
        // Resistance II takes 40%: a declared multiply modifier of 0.6.
        expect(swing.committed && swing.computation.modifiers).toEqual([
            { name: 'resistance', operation: 'multiply', value: 0.6, priority: 400, amountAfter: 3 }
        ]);
        expect(cow.instance.attributes.get('health')?.current).toBe(5);
    });

    it('ignores a weaker blow inside the grace period and lands a harder one for the difference', () => {
        const { runtime } = entityFixture();
        const cow = runtime.spawn('minecraft:cow', GROUND);
        if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
        const graced = { route: 'melee', graced: true } as const;

        runtime.damage(blow(cow.id, 3, { source: graced }));
        const weaker = runtime.damage(blow(cow.id, 2, { source: graced }));
        const harder = runtime.damage(blow(cow.id, 5, { source: graced }));

        expect(weaker).toMatchObject({ committed: false, rejectedBy: 'hit_grace' });
        expect(harder).toMatchObject({ committed: true, taken: 2 });
        expect(cow.instance.attributes.get('health')?.current).toBe(5);
    });

    it('commits a blow a damage sensor turned aside, so the sensor event still fires', () => {
        const { runtime } = entityFixture(new TestEntityWorld(), {}, HAZARDED);
        const sensing = runtime.spawn('jsprismarine:sensing', GROUND);
        if (sensing === undefined) throw new Error('the fixture declares no jsprismarine:sensing');

        const outcome = runtime.damage(blow(sensing.id, 5, { cause: 'lightning' }));
        runtime.tick(1);

        expect(outcome).toMatchObject({ committed: true, taken: 0 });
        expect(sensing.instance.attributes.get('health')?.current).toBe(10);
        expect(sensing.instance.hasComponent('minecraft:is_shaking')).toBe(true);
    });

    describe('a death', () => {
        it('runs in the commit and removes the entity with one membership entry in the same tick', () => {
            const { runtime, removed } = entityFixture();
            const cow = runtime.spawn('minecraft:cow', GROUND);
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');

            let outcome: ReturnType<typeof runtime.damage> | undefined;
            const entries = logged(runtime.store, () => (outcome = runtime.damage(blow(cow.id, 20))));

            expect(outcome).toMatchObject({ committed: true, died: true });
            expect(runtime.byId(cow.id)).toBeUndefined();
            expect(removed).toEqual([{ entity: cow, reason: 'death' }]);
            const memberships = entries.filter((entry) => entry.kind === 'membership');
            expect(memberships).toHaveLength(1);
            expect(memberships[0]).toMatchObject({ change: 'leave', entity: BigInt(cow.id) });
        });

        it('refuses every further blow on an entity already removed', () => {
            const { runtime } = entityFixture();
            const cow = runtime.spawn('minecraft:cow', GROUND);
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');

            runtime.damage(blow(cow.id, 20));

            expect(runtime.damage(blow(cow.id, 1))).toMatchObject({ committed: false, rejectedBy: 'present' });
        });

        it('comes from a component hazard too, which used to leave the entity at no health', () => {
            const { runtime, removed } = entityFixture(new TestEntityWorld(), {}, HAZARDED);
            const hazarded = runtime.spawn('jsprismarine:hazarded', GROUND);
            if (hazarded === undefined) throw new Error('the fixture declares no jsprismarine:hazarded');

            for (let tick = 1; tick <= 200 && hazarded.removed === undefined; tick += 1) runtime.tick(tick);

            expect(removed.map((entry) => [entry.entity.identifier, entry.reason])).toEqual([
                ['jsprismarine:hazarded', 'death']
            ]);
            expect(runtime.damagePipeline.runsByRoute().get('component')).toBe(4);
        });
    });

    describe('every runtime route', () => {
        it('reaches the pipeline once per blow, by route', () => {
            const { runtime } = entityFixture(new TestEntityWorld(), {}, HAZARDED);
            const attacker = runtime.spawn('minecraft:cow', GROUND);
            const bitten = runtime.spawn('minecraft:cow', { ...GROUND, x: 1.5 });
            const burning = runtime.spawn('jsprismarine:sensing', { ...GROUND, x: 4.5 });
            const falling = runtime.spawn('jsprismarine:sensing', { ...GROUND, y: -200 });
            if (attacker === undefined || bitten === undefined || burning === undefined || falling === undefined)
                throw new Error('the fixture declares no cow or jsprismarine:sensing');
            const bittenView = runtime.mobById(bitten.id);
            if (bittenView === undefined) throw new Error('the runtime cannot see its cow');

            runtime.attack(attacker.body, bittenView);
            burning.body.fireTicks = 100;
            // The burn and the void both hurt on a fixed cadence of the level clock, which the
            // fixture starts at zero, so one tick runs one of each.
            runtime.tick(1);

            const runs = Object.fromEntries(runtime.damagePipeline.runsByRoute());
            expect(runs).toMatchObject({ mob_attack: 1, fire: 1, void: 1 });
            expect(bitten.body.damage.last()).toMatchObject({ sourceId: attacker.id, cause: 'entity_attack' });
        });
    });

    describe('a mob hitting a player in the store', () => {
        it('keeps the resistance and the grace period a player has', () => {
            const { runtime } = entityFixture(
                undefined,
                {},
                {
                    [PLAYER_IDENTIFIER]: SHIPPED_PLAYER,
                    'jsprismarine:biter': {
                        components: {
                            'minecraft:collision_box': { width: 0.6, height: 1.8 },
                            'minecraft:health': { value: 10, max: 10 },
                            'minecraft:attack': { damage: 5 }
                        }
                    }
                }
            );
            const biter = runtime.spawn('jsprismarine:biter', { ...GROUND, x: 1.5 });
            const player = runtime.spawn(PLAYER_IDENTIFIER, GROUND);
            const target = player === undefined ? undefined : runtime.mobById(player.id);
            if (biter === undefined || player === undefined || target === undefined)
                throw new Error('the fixture declares no biter or player');
            player.body.statusEffects.set('minecraft:resistance', {
                id: 'minecraft:resistance',
                amplifier: 1,
                durationTicks: 100,
                ambient: false,
                showParticles: true,
                showIcon: true
            });
            const health = (): number | undefined => player.instance.attributes.get('health')?.current;
            const before = health() ?? 0;

            runtime.attack(biter.body, target);
            const once = before - (health() ?? 0);
            runtime.attack(biter.body, target);

            // Resistance II takes 40% of the blow, and the second swing lands inside the grace.
            expect(biter.body.facts.attackDamage).toBe(5);
            expect(once).toBeCloseTo(3, 6);
            expect(before - (health() ?? 0)).toBeCloseTo(once, 6);
        });
    });

    describe('a mob whose bite carries an effect', () => {
        it('leaves no effect with a swing the grace period turned aside', () => {
            const { runtime } = entityFixture(
                undefined,
                {},
                {
                    [PLAYER_IDENTIFIER]: SHIPPED_PLAYER,
                    'jsprismarine:stinger': {
                        components: {
                            'minecraft:collision_box': { width: 0.6, height: 1.8 },
                            'minecraft:health': { value: 10, max: 10 },
                            'minecraft:attack': { damage: 2, effect_name: 'poison', effect_duration: 10 }
                        }
                    }
                }
            );
            const stinger = runtime.spawn('jsprismarine:stinger', { ...GROUND, x: 1.5 });
            const player = runtime.spawn(PLAYER_IDENTIFIER, GROUND);
            const target = player === undefined ? undefined : runtime.mobById(player.id);
            if (stinger === undefined || player === undefined || target === undefined)
                throw new Error('the fixture declares no stinger or player');
            const effects = player.body.statusEffects;

            runtime.attack(stinger.body, target);
            const poisoned = [...effects.keys()];
            expect(poisoned).toHaveLength(1);

            // The poison has run out, and the second swing lands inside the first one's grace.
            effects.clear();
            runtime.attack(stinger.body, target);

            expect([...effects.keys()]).toEqual([]);
        });
    });

    describe('the rules a swing keeps', () => {
        /** A swing from `origin`, which keeps the grace period and shoves away from where it came. */
        const swing = (target: number, amount: number, levels = 0, origin = { x: -1.5, y: GROUND.y, z: 0.5 }) =>
            blow(target, amount, {
                cause: 'attack',
                source: { route: 'melee', graced: true, mitigated: true, knockback: { origin, levels } }
            });

        const cowOf = (runtime: ReturnType<typeof entityFixture>['runtime']) => {
            const cow = runtime.spawn('minecraft:cow', GROUND);
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            return cow;
        };

        it('takes another full hit once the grace has run out', () => {
            const { runtime } = entityFixture();
            const cow = cowOf(runtime);

            runtime.damage(blow(cow.id, 3, { source: { route: 'melee', graced: true } }));
            for (let tick = 1; tick <= 10; tick += 1) runtime.tick(tick);
            const again = runtime.damage(blow(cow.id, 3, { source: { route: 'melee', graced: true } }));

            expect(again).toMatchObject({ committed: true, taken: 3 });
            expect(cow.instance.attributes.get('health')?.current).toBe(4);
        });

        it('lets the void through the grace period regardless', () => {
            const { runtime } = entityFixture();
            const cow = cowOf(runtime);

            runtime.damage(blow(cow.id, 3, { source: { route: 'melee', graced: true } }));
            const fall = runtime.damage(
                blow(cow.id, 3, { cause: 'void', source: { route: 'void', graced: true, bypassesGrace: true } })
            );

            expect(fall).toMatchObject({ committed: true, taken: 3 });
        });

        it('pushes away from where the blow came, and harder for each Knockback level', () => {
            const plain = entityFixture();
            const strong = entityFixture();
            const softly = cowOf(plain.runtime);
            const hard = cowOf(strong.runtime);

            plain.runtime.damage(swing(softly.id, 1));
            strong.runtime.damage(swing(hard.id, 1, 2));

            // The blow came from the west, so both go east, the Knockback II one further.
            expect(softly.body.velocity.x).toBeGreaterThan(0);
            expect(hard.body.velocity.x).toBeGreaterThan(softly.body.velocity.x);
        });

        it('does not shove again for the difference a harder hit inside the grace period takes', () => {
            const { runtime } = entityFixture();
            const cow = cowOf(runtime);

            runtime.damage(swing(cow.id, 2));
            const after = { ...cow.body.velocity };
            const harder = runtime.damage(swing(cow.id, 5));

            expect(harder).toMatchObject({ committed: true, taken: 3 });
            expect(cow.body.velocity).toEqual(after);
        });

        it('picks a direction rather than dividing by zero when the blow comes from where it stands', () => {
            const { runtime } = entityFixture();
            const cow = cowOf(runtime);

            runtime.damage(swing(cow.id, 1, 0, { ...GROUND }));

            const { x, z } = cow.body.velocity;
            expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true);
            expect(Math.hypot(x, z)).toBeGreaterThan(0);
        });
    });
});
