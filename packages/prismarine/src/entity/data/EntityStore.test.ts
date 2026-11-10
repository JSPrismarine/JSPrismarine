import { describe, expect, it } from 'vitest';

import { coalesceTick } from '../../world/changelog/coalesceTick';
import type { PlainRecord } from '../../world/changelog/PlainData';
import type { EntityWorldFacts } from './host';
import type { DataEntity } from './DataEntity';
import { ENTITY_FAILURE_LIMIT } from './EntityStore';
import type { EntityRuntime } from './EntityRuntime';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

const GROUND = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/** Entity types that carry every kind of state the store logs. */
const EXTRA = {
    'jsprismarine:logged': {
        description: {
            identifier: 'jsprismarine:logged',
            is_spawnable: true,
            is_summonable: true,
            properties: { 'jsprismarine:mood': { type: 'int', range: [0, 5], default: 0 } }
        },
        components: {
            'minecraft:health': { value: 10, max: 10 },
            'minecraft:movement': { value: 0.25 },
            'minecraft:collision_box': { width: 0.6, height: 0.6 },
            'minecraft:breathable': { total_supply: 15, suffocate_time: 0 },
            'minecraft:leashable': {},
            'minecraft:inventory': { container_type: 'horse', inventory_size: 2 },
            'minecraft:rideable': { seat_count: 1 }
        },
        component_groups: { grown: { 'minecraft:health': { value: 30, max: 30 } } },
        events: { grow: { add: { component_groups: ['grown'] } } }
    }
};

/** A fixture whose random source starts the wanderers' stroll, so they walk. */
const fixture = () => entityFixture(new TestEntityWorld({ random: [0.95, 0.5, 0.5, 0.1] }), {}, EXTRA);

const spawnLogged = (runtime: EntityRuntime, at = GROUND): DataEntity => {
    const entity = runtime.spawn('jsprismarine:logged', at);
    if (entity === undefined) throw new Error('the fixture declares no jsprismarine:logged');
    return entity;
};

/** Every member's saved form, by runtime id, which is what an undo has to restore exactly. */
const savedForms = (runtime: EntityRuntime): Map<number, PlainRecord> =>
    new Map([...runtime.store.values()].map((entity) => [entity.id, runtime.savedFormOf(entity)]));

/** One write to every kind of state the store logs, each named by the entry address it appends. */
const WRITES: readonly {
    readonly field: string;
    readonly write: (entity: DataEntity, runtime: EntityRuntime, other: DataEntity) => void;
    /** False for a field the saved form holds only for a projectile, which this entity is not. */
    readonly saved?: false;
}[] = [
    { field: 'position', write: ({ body }) => (body.position = { x: 3, y: FLOOR_Y + 1, z: 2 }) },
    { field: 'yaw', write: ({ body }) => (body.yaw = 90) },
    { field: 'pitch', write: ({ body }) => (body.pitch = 12) },
    { field: 'velocity', write: ({ body }) => body.push({ x: 0.2, y: 0.1, z: 0 }) },
    { field: 'nameTag', write: ({ body }) => (body.nameTag = 'Logged') },
    { field: 'color', write: ({ body }) => (body.color = 4) },
    { field: 'home', write: ({ body }) => (body.home = { x: 1, y: 2, z: 3 }) },
    { field: 'ownerIdentity', write: ({ body }) => (body.ownerIdentity = 'owner') },
    { field: 'curedBy', write: ({ body }) => (body.curedBy = 'healer') },
    { field: 'sitting', write: ({ body }) => (body.sitting = true) },
    { field: 'sleeping', write: ({ body }) => (body.sleeping = true) },
    { field: 'loveTicks', write: ({ body }) => (body.loveTicks = 600) },
    { field: 'breedCooldown', write: ({ body }) => (body.breedCooldown = 20) },
    { field: 'beamTarget', write: ({ body }) => (body.beamTarget = { x: 0, y: 70, z: 0 }) },
    { field: 'showBottom', write: ({ body }) => (body.showBottom = false) },
    { field: 'invulnerable', write: ({ body }) => (body.invulnerable = true) },
    { field: 'fuseTicks', write: ({ body }) => (body.fuseTicks = 30) },
    { field: 'fireTicks', write: ({ body }) => (body.fireTicks = 80) },
    { field: 'projectileAge', write: ({ body }) => (body.projectileAge = 5), saved: false },
    { field: 'projectileStuck', write: ({ body }) => (body.projectileStuck = true), saved: false },
    {
        field: 'equipment',
        write: ({ body }) => body.setEquipment({ mainhand: { identifier: 'minecraft:bow', count: 1 } })
    },
    { field: 'inventory', write: ({ body }) => body.setInventory(['minecraft:wheat', 'minecraft:bread']) },
    {
        field: 'containerSlots',
        write: ({ body }) => body.setContainerSlot(1, { identifier: 'minecraft:saddle', count: 1 })
    },
    { field: 'tags', write: ({ body }) => body.tags.add('logged') },
    {
        field: 'statusEffects',
        write: ({ body }) =>
            body.statusEffects.set('minecraft:speed', {
                id: 'minecraft:speed',
                amplifier: 1,
                durationTicks: 100,
                ambient: false,
                showParticles: true,
                showIcon: true
            })
    },
    { field: 'equipmentInventorySlots', write: ({ body }) => body.equipmentInventorySlots.set('body', 1) },
    { field: 'attribute:health', write: ({ instance }) => instance.attributes.set('health', 3) },
    { field: 'property:jsprismarine:mood', write: ({ instance }) => instance.properties.set('jsprismarine:mood', 4) },
    {
        field: 'groups',
        write: ({ instance }) => {
            instance.raise('grow', 'self', 'test');
            instance.applyQueuedEvents();
        }
    },
    {
        field: 'component:minecraft:breathable',
        write: ({ instance }) => instance.componentState.write('minecraft:breathable', { remaining: 2, untilHurt: 1 })
    },
    { field: 'leash', write: (entity, runtime, other) => runtime.attachLead(other.id, entity.id) },
    {
        field: 'vehicle',
        write: (entity, runtime, other) => {
            const vehicle = runtime.mobById(other.id);
            if (vehicle === undefined) throw new Error('the vehicle is not in the store');
            runtime.mount(entity.body, vehicle);
        }
    }
];

/** Thrown by a unit a test wants reverted. */
class Planned extends Error {}

describe('the entity store', () => {
    it('logs one entering entry, carrying the saved form, for a spawn and the writes that built it', () => {
        const { runtime } = fixture();
        runtime.store.beginTick();
        const entity = spawnLogged(runtime);
        const sealed = runtime.store.sealTick();

        expect(sealed?.entries).toEqual([
            { kind: 'membership', change: 'enter', entity: BigInt(entity.id), saved: runtime.savedFormOf(entity) }
        ]);
    });

    it('logs a leaving entry with the form the entity had before its removal', () => {
        const { runtime } = fixture();
        const entity = spawnLogged(runtime);
        const before = runtime.savedFormOf(entity);
        runtime.store.beginTick();
        runtime.remove(entity.id, 'test');

        expect(runtime.store.sealTick()?.entries).toEqual([
            { kind: 'membership', change: 'leave', entity: BigInt(entity.id), saved: before }
        ]);
        expect(runtime.store.has(entity.id)).toBe(false);
    });

    it.each(WRITES)(
        'logs a change to $field with its value before and after, and undoes it exactly',
        ({ field, write, saved }) => {
            const { runtime } = fixture();
            const entity = spawnLogged(runtime);
            const other = spawnLogged(runtime, { x: 2.5, y: FLOOR_Y + 1, z: 0.5 });
            const before = savedForms(runtime);
            runtime.store.beginTick();

            const outcome = runtime.store.unit(() => {
                write(entity, runtime, other);
                throw new Planned();
            });
            expect(outcome).toEqual({ failed: true, error: expect.any(Planned) });
            expect(runtime.store.broken).toBeUndefined();
            expect(savedForms(runtime)).toEqual(before);
            expect(runtime.store.sealTick()?.entries).toEqual([]);

            // The same write in a unit that finishes stays, as entries addressed to that field.
            runtime.store.beginTick();
            runtime.store.unit(() => write(entity, runtime, other));
            const entries = runtime.store.sealTick()?.entries ?? [];
            expect(entries).toContainEqual(
                expect.objectContaining({
                    kind: 'field',
                    field: 'entity',
                    address: { entity: BigInt(entity.id), field }
                })
            );
            if (saved !== false) expect(savedForms(runtime)).not.toEqual(before);
        }
    );

    it('undoes a spawn and a removal inside a unit, bringing the removed entity back under its id', () => {
        const { runtime } = fixture();
        const doomed = spawnLogged(runtime);
        doomed.body.nameTag = 'Doomed';
        const before = savedForms(runtime);
        runtime.store.beginTick();

        runtime.store.unit(() => {
            spawnLogged(runtime, { x: 4.5, y: FLOOR_Y + 1, z: 4.5 });
            runtime.remove(doomed.id, 'test');
            throw new Planned();
        });

        expect(savedForms(runtime)).toEqual(before);
        expect(runtime.store.get(doomed.id)?.body.nameTag).toBe('Doomed');
    });

    it("restores the store exactly after reverting a whole tick's spans in reverse", () => {
        const { runtime } = fixture();
        for (let index = 0; index < 4; index += 1)
            runtime.spawn('jsprismarine:wanderer', { x: index * 3 + 0.5, y: FLOOR_Y + 1, z: 0.5 });
        spawnLogged(runtime, { x: 0.5, y: FLOOR_Y + 4, z: 6.5 });
        for (let tick = 1; tick <= 5; tick += 1) runtime.tick(tick);
        const before = savedForms(runtime);
        runtime.store.beginTick();

        // The tick runs inside one unit, so each entity's span closes into it and the throw at
        // the end reverts all of them, newest first.
        runtime.store.unit(() => {
            for (let tick = 6; tick <= 10; tick += 1) runtime.tick(tick);
            expect(savedForms(runtime)).not.toEqual(before);
            throw new Planned();
        });

        expect(runtime.store.broken).toBeUndefined();
        expect(savedForms(runtime)).toEqual(before);
    });

    it('appends nothing for an idle world', () => {
        const { runtime } = fixture();
        runtime.spawn('minecraft:cow', GROUND);
        for (let tick = 1; tick <= 20; tick += 1) runtime.tick(tick);
        runtime.store.beginTick();
        for (let tick = 21; tick <= 40; tick += 1) runtime.tick(tick);

        expect(runtime.store.sealTick()?.entries).toEqual([]);
    });

    it('appends at most one position write per walking mob in a tick', () => {
        const { runtime } = fixture();
        const walkers = 6;
        for (let index = 0; index < walkers; index += 1)
            runtime.spawn('jsprismarine:wanderer', { x: index * 4 + 0.5, y: FLOOR_Y + 1, z: 0.5 });
        for (let tick = 1; tick <= 3; tick += 1) runtime.tick(tick);

        let moved = 0;
        for (let tick = 4; tick <= 40; tick += 1) {
            runtime.store.beginTick();
            runtime.tick(tick);
            const sealed = runtime.store.sealTick();
            if (sealed === undefined) throw new Error('no tick was open');
            const positions = sealed.entries.filter(
                (entry) => entry.kind === 'field' && entry.field === 'entity' && entry.address.field === 'position'
            );
            // Raw writes: a walker's step writes its position once, so the log holds one entry per
            // walker that moved, and a reader's coalesced view holds the same number.
            expect(positions.length).toBeLessThanOrEqual(walkers);
            const coalesced = [...coalesceTick(sealed).entities.values()].filter((fields) => fields.has('position'));
            expect(coalesced.length).toBe(positions.length);
            moved += positions.length;
        }
        expect(moved).toBeGreaterThan(0);
    });

    it('seals a tick that survives a structured clone unchanged', () => {
        const { runtime } = fixture();
        for (let index = 0; index < 3; index += 1)
            runtime.spawn('jsprismarine:wanderer', { x: index * 4 + 0.5, y: FLOOR_Y + 1, z: 0.5 });
        runtime.store.beginTick();
        const logged = spawnLogged(runtime, { x: 0.5, y: FLOOR_Y + 1, z: 8.5 });
        for (const { write } of WRITES) write(logged, runtime, logged);
        runtime.tick(1);
        const sealed = runtime.store.sealTick();

        expect(sealed?.entries.length).toBeGreaterThan(WRITES.length);
        expect(structuredClone(sealed)).toEqual(sealed);
    });

    it('reaches the live state from a snapshot of the tick before and the log of the ticks after', () => {
        const live = fixture();
        for (let index = 0; index < 4; index += 1)
            live.runtime.spawn('jsprismarine:wanderer', { x: index * 3 + 0.5, y: FLOOR_Y + 1, z: 0.5 });
        spawnLogged(live.runtime, { x: 0.5, y: FLOOR_Y + 4, z: 6.5 });
        for (let tick = 1; tick <= 3; tick += 1) live.runtime.tick(tick);

        // The snapshot: every member's saved form at a tick boundary.
        const snapshot = savedForms(live.runtime);
        const log = [];
        for (let tick = 4; tick <= 12; tick += 1) {
            live.runtime.store.beginTick();
            live.runtime.tick(tick);
            if (tick === 8) live.runtime.spawn('minecraft:cow', { x: 9.5, y: FLOOR_Y + 1, z: 9.5 });
            const sealed = live.runtime.store.sealTick();
            if (sealed !== undefined) log.push(sealed);
        }

        const rebuilt = fixture();
        rebuilt.runtime.store.replay(
            [...snapshot].map(
                ([id, saved]) => ({ kind: 'membership', change: 'enter', entity: BigInt(id), saved }) as const
            )
        );
        for (const sealed of log) rebuilt.runtime.store.replay(sealed.entries);

        expect(savedForms(rebuilt.runtime)).toEqual(savedForms(live.runtime));
    });

    describe('failure containment', () => {
        /** A world whose block reads around one column throw while `failing` says so. */
        class FaultyWorld extends TestEntityWorld {
            public failing: (at: { readonly x: number }) => boolean = () => false;

            public override get world(): EntityWorldFacts {
                const facts = super.world;
                return {
                    ...facts,
                    blocks: {
                        ...facts.blocks,
                        get: (at) => {
                            if (this.failing(at)) throw new Error('the block read failed');
                            return facts.blocks.get(at);
                        }
                    }
                };
            }
        }

        it('undoes the update of an entity that throws, skips it, and removes it after the fixed count', () => {
            const world = new FaultyWorld({ random: [0.95, 0.5, 0.5, 0.1] });
            const { runtime, reports } = entityFixture(world, {}, EXTRA);
            const faulty = spawnLogged(runtime, { x: 20.5, y: FLOOR_Y + 1, z: 0.5 });
            const healthy = spawnLogged(runtime);
            faulty.body.loveTicks = 1000;
            healthy.body.loveTicks = 1000;
            for (let tick = 1; tick <= 3; tick += 1) runtime.tick(tick);

            // The update reads blocks before and after it counts love down, and the reads after
            // throw, so each failing update has already written when it throws.
            let loveAtStart = faulty.body.loveTicks;
            world.failing = (at) => Math.abs(at.x - 20) < 4 && faulty.body.loveTicks < loveAtStart;

            for (let failure = 1; failure <= ENTITY_FAILURE_LIMIT; failure += 1) {
                loveAtStart = faulty.body.loveTicks;
                const before = runtime.savedFormOf(faulty);
                const healthyLove = healthy.body.loveTicks;
                runtime.store.beginTick();
                runtime.tick(3 + failure);
                const sealed = runtime.store.sealTick();

                const addressed = (sealed?.entries ?? []).filter(
                    (entry) =>
                        entry.kind === 'field' && entry.field === 'entity' && entry.address.entity === BigInt(faulty.id)
                );
                expect(addressed).toEqual([]);
                if (failure < ENTITY_FAILURE_LIMIT) {
                    expect(runtime.savedFormOf(faulty)).toEqual(before);
                    expect(runtime.store.has(faulty.id)).toBe(true);
                }
                // The pass goes on: the entity after the failing one still updates.
                expect(healthy.body.loveTicks).toBe(healthyLove - 1);
            }

            expect(runtime.store.has(faulty.id)).toBe(false);
            expect(reports.filter((line) => line.includes('threw in its update'))).toHaveLength(ENTITY_FAILURE_LIMIT);
            expect(runtime.store.broken).toBeUndefined();
        });

        it('forgets a run of failures once an update finishes', () => {
            const world = new FaultyWorld();
            const { runtime } = entityFixture(world, {}, EXTRA);
            const entity = spawnLogged(runtime);
            for (let tick = 1; tick <= 20; tick += 1) {
                world.failing = (at) => tick % 2 === 0 && Math.abs(at.x) < 4;
                runtime.store.beginTick();
                runtime.tick(tick);
                runtime.store.sealTick();
            }

            expect(runtime.store.has(entity.id)).toBe(true);
        });

        it('stops the pass when an inverse cannot be written, since the store can no longer be trusted', () => {
            const { runtime, reports } = entityFixture(undefined, {}, EXTRA);
            const entity = spawnLogged(runtime);
            entity.body.loveTicks = 1000;
            runtime.store.beginTick();

            runtime.store.unit(() => {
                runtime.store.written(entity, 'not-a-field', 1, 2);
                throw new Planned();
            });
            runtime.tick(1);

            expect(runtime.store.broken).toBeInstanceOf(Error);
            expect(reports.some((line) => line.includes('no writer for not-a-field'))).toBe(true);
            expect(entity.body.loveTicks).toBe(1000);
        });
    });
});
