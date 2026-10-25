import { describe, expect, it } from 'vitest';

import { Activities } from '@jsprismarine/entity-brains';

import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

/** A runtime over the entity fixture, with the world a test can poke at. */
const runtimeOf = (world = new TestEntityWorld()) => entityFixture(world);

const GROUND = { x: 0, y: FLOOR_Y + 1, z: 0 };

describe('EntityRuntime', () => {
    describe('entity facts', () => {
        it('reads a type’s stats off its definition rather than off a table', () => {
            const { runtime } = runtimeOf();
            const cow = runtime.typeFacts().get('minecraft:cow');

            expect(cow).toMatchObject({
                identifier: 'minecraft:cow',
                box: { width: 0.9, height: 1.3 },
                health: 10,
                attackDamage: 2,
                knockbackResistance: 0.25,
                followRange: 24,
                families: ['cow', 'mob'],
                lootTable: 'loot_tables/entities/cow.json'
            });
        });

        it('has no facts at all for a type no pack declared', () => {
            const { runtime } = runtimeOf();

            expect(runtime.typeFacts().get('minecraft:wither')).toBeUndefined();
        });
    });

    describe('spawning', () => {
        it('runs the spawn event for the cause, and only that one', () => {
            const { runtime } = runtimeOf();

            const spawned = runtime.spawn('jsprismarine:hatchling', GROUND);
            const born = runtime.spawn('jsprismarine:hatchling', GROUND, { cause: 'born' });

            expect(spawned?.instance.activeComponentGroups()).toEqual(['hatched']);
            expect(born?.instance.activeComponentGroups()).toEqual(['grown']);
        });

        it('replaces the built-in spawn event with the one the caller names', () => {
            const { runtime } = runtimeOf();

            const named = runtime.spawn('jsprismarine:hatchling', GROUND, { event: 'jsprismarine:named_spawn' });

            expect(named?.instance.activeComponentGroups()).toEqual(['grown', 'hatched']);
        });

        it('applies what the spawn event did to the entity’s own state', () => {
            const { runtime } = runtimeOf();

            const born = runtime.spawn('jsprismarine:hatchling', GROUND, { cause: 'born' });

            // The `grown` group replaces the base `minecraft:health`, which is the whole point
            // of a component group being a state machine rather than a patch.
            expect(born?.instance.attributes.get('health')?.max).toBe(12);
        });

        it('refuses a type the content declares nothing for, and says so', () => {
            const { runtime, reports } = runtimeOf();

            expect(runtime.spawn('minecraft:wither', GROUND)).toBeUndefined();
            expect(reports.join('\n')).toContain('minecraft:wither');
        });

        it('gives every entity a runtime id of its own', () => {
            const { runtime } = runtimeOf();

            const first = runtime.spawn('minecraft:cow', GROUND);
            const second = runtime.spawn('minecraft:cow', GROUND);

            expect(first?.id).not.toBe(second?.id);
            expect(runtime.all()).toHaveLength(2);
        });

        it('announces each entity once its spawn event has run', () => {
            const { runtime, spawned } = runtimeOf();

            runtime.spawn('jsprismarine:hatchling', GROUND);

            expect(spawned).toHaveLength(1);
            expect(spawned[0]?.instance.activeComponentGroups()).toEqual(['hatched']);
        });

        it('announces each removal with the reason it was given', () => {
            const { runtime, removed } = runtimeOf();

            const cow = runtime.spawn('minecraft:cow', GROUND);
            runtime.remove(cow!.id, 'despawn');

            expect(removed).toEqual([{ entity: cow, reason: 'despawn' }]);
        });
    });

    describe('combat', () => {
        it('sends a blow at a player out through the host', () => {
            const player = { id: 99, identifier: 'minecraft:player', position: { x: 1, y: FLOOR_Y + 1, z: 0 } };
            const world = new TestEntityWorld({ players: [player] });
            const { runtime } = runtimeOf(world);

            const cow = runtime.spawn('minecraft:cow', GROUND);
            runtime.attack(cow!.body, runtime.mobById(99)!);

            expect(world.hits).toEqual([{ id: 99, amount: 2, cause: 'entity_attack', sourceId: cow!.id }]);
        });

        it('takes health off an entity this index does hold', () => {
            const { runtime } = runtimeOf();

            const attacker = runtime.spawn('minecraft:cow', GROUND);
            const victim = runtime.spawn('minecraft:cow', GROUND);
            runtime.attack(attacker!.body, runtime.mobById(victim!.id)!);

            expect(victim!.instance.attributes.get('health')?.current).toBe(8);
            expect(victim!.body.damage.last()?.sourceId).toBe(attacker!.id);
        });
    });

    describe('the goal scheduler', () => {
        it('gives a contested control flag to the better priority', () => {
            const world = new TestEntityWorld({
                players: [{ id: 99, identifier: 'minecraft:player', position: { x: 2, y: FLOOR_Y + 1, z: 0 } }]
            });
            const { runtime } = runtimeOf(world);

            const wanderer = runtime.spawn('jsprismarine:wanderer', GROUND);
            runtime.tick(1);

            // `look_at_player` is priority 2 and `random_stroll` is priority 6; both were
            // forced onto the move flag, and 0 is the highest priority.
            expect(wanderer?.instance.goals.names()).toEqual([
                'minecraft:behavior.look_at_player',
                'minecraft:behavior.random_stroll'
            ]);
            expect(wanderer?.instance.goals.holderOf('move')).toBe('minecraft:behavior.look_at_player');
        });

        it('walks the entity to where the running goal sent it', () => {
            // No players, so `look_at_player` cannot start and the stroll takes the move flag.
            const world = new TestEntityWorld({ random: [0.95, 0.5, 0.5, 0.1] });
            const { runtime } = runtimeOf(world);

            const wanderer = runtime.spawn('jsprismarine:wanderer', GROUND);
            const before = { ...(wanderer?.position ?? GROUND) };
            for (let tick = 1; tick <= 20; tick += 1) runtime.tick(tick);

            expect(wanderer?.instance.goals.holderOf('move')).toBe('minecraft:behavior.random_stroll');
            expect(wanderer?.position).not.toEqual(before);
        });

        it('runs no goals for an entity whose definition declares none', () => {
            const { runtime } = runtimeOf();

            const cow = runtime.spawn('minecraft:cow', GROUND);
            runtime.tick(1);

            expect(cow?.instance.goals.names()).toEqual([]);
        });
    });

    describe('brains', () => {
        it('runs a brain mob’s brain and reaches an activity', () => {
            const { runtime } = runtimeOf();

            const goat = runtime.spawn('minecraft:goat', GROUND);
            runtime.tick(1);

            expect(goat?.brainMob?.id).toBe('minecraft:goat');
            expect(goat?.brain?.isActive(Activities.IDLE)).toBe(true);
        });

        it('leaves a goal-only entity without a brain', () => {
            const { runtime } = runtimeOf();

            expect(runtime.spawn('minecraft:cow', GROUND)?.brain).toBeUndefined();
        });

        it('runs the goal scheduler for everything that is not a brain mob', () => {
            const { runtime } = runtimeOf();

            expect(runtime.spawn('minecraft:cow', GROUND)?.runsGoals).toBe(true);
            expect(runtime.spawn('minecraft:goat', GROUND)?.runsGoals).toBe(false);
        });
    });

    describe('death', () => {
        it('drops what the entity’s own loot table rolls', () => {
            const world = new TestEntityWorld();
            const { runtime } = runtimeOf(world);

            const cow = runtime.spawn('minecraft:cow', GROUND);
            runtime.kill(cow!);

            expect(world.drops.map((drop) => drop.item.identifier)).toEqual(['minecraft:leather']);
            expect(runtime.all()).toHaveLength(0);
        });

        it('rolls nothing with doMobLoot off, and still takes the entity', () => {
            const world = new TestEntityWorld({ gameRules: { doMobLoot: false } });
            const { runtime } = runtimeOf(world);

            const cow = runtime.spawn('minecraft:cow', GROUND);
            runtime.kill(cow!);

            expect(world.drops).toHaveLength(0);
            expect(runtime.all()).toHaveLength(0);
        });
    });

    describe('counting', () => {
        it('counts entities of one type within a radius', () => {
            const { runtime } = runtimeOf();

            runtime.spawn('minecraft:cow', GROUND);
            runtime.spawn('minecraft:cow', { x: 20, y: FLOOR_Y + 1, z: 0 });

            expect(runtime.countOfType('minecraft:cow', GROUND, 5)).toBe(1);
            expect(runtime.countOfType('minecraft:cow', GROUND, 30)).toBe(2);
        });

        it('counts a population pool only while its entities are alive', () => {
            const { runtime } = runtimeOf();

            const cow = runtime.spawn('minecraft:cow', GROUND, { pool: 'animal' });
            expect(runtime.poolCount('animal')).toBe(1);

            runtime.remove(cow!.id, 'despawn');
            expect(runtime.poolCount('animal')).toBe(0);
        });
    });
});
