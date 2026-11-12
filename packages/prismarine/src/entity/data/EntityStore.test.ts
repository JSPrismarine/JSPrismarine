import { describe, expect, it } from 'vitest';

import { coalesceTick } from '../../world/changelog/coalesceTick';
import type { PlainRecord } from '../../world/changelog/PlainData';
import type { EntityHostFacts, EntityWorldFacts } from './host';
import type { DataEntity } from './DataEntity';
import { ENTITY_FAILURE_LIMIT, EntityStore } from './EntityStore';
import type { EntityRuntime } from './EntityRuntime';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';
import { PLAYER_IDENTIFIER } from '../playerOverlay';
import { storePlayerFixture } from '../../testing/storePlayer.test.helper';
import { beginMeasuredTick } from '../../testing/changeTicks.test.helper';

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
    { field: 'owner', write: ({ body }) => (body.owner = 7) },
    // A new entity's clock starts again, as a new store actor's did, so no saved form holds it.
    { field: 'statusEffectClock', write: ({ body }) => (body.statusEffectClock = { age: 40, tick: 9 }), saved: false },
    { field: 'actorTags', write: ({ body }) => (body.actorTags = new Uint8Array([10, 0, 0])) },
    { field: 'condition:in_water', write: ({ body }) => body.conditions.add('in_water') },
    { field: 'condition:on_ground', write: ({ body }) => body.conditions.add('on_ground') },
    { field: 'projectileAge', write: ({ body }) => (body.projectileAge = 5), saved: false },
    { field: 'projectileStuck', write: ({ body }) => (body.projectileStuck = true), saved: false },
    { field: 'teleports', write: ({ body }) => body.teleportTo({ x: 3, y: FLOOR_Y + 1, z: 2 }) },
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

/** A world whose block reads throw where `failing` says so. */
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

describe('the entity store', () => {
    it('logs one entering entry, carrying the saved form, for a spawn and the writes that built it', () => {
        const { runtime } = fixture();
        beginMeasuredTick(runtime.store);
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
        beginMeasuredTick(runtime.store);
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
            beginMeasuredTick(runtime.store);

            const outcome = runtime.store.unit(() => {
                write(entity, runtime, other);
                throw new Planned();
            });
            expect(outcome).toEqual({ failed: true, error: expect.any(Planned) });
            expect(runtime.store.broken).toBeUndefined();
            expect(savedForms(runtime)).toEqual(before);
            expect(runtime.store.sealTick()?.entries).toEqual([]);

            // The same write in a unit that finishes stays, as entries addressed to that field.
            beginMeasuredTick(runtime.store);
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
        beginMeasuredTick(runtime.store);

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
        beginMeasuredTick(runtime.store);

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

    it('keeps the actor record tags it logged when the bytes handed over or read back change in place', () => {
        const { runtime } = fixture();
        const cow = runtime.spawn('minecraft:cow', GROUND);
        if (cow === undefined) throw new Error('the fixture declares no cow');
        runtime.store.beginTick();
        runtime.store.sealTick();
        runtime.store.beginTick();

        const given = new Uint8Array([10, 0, 0]);
        cow.body.actorTags = given;
        given[0] = 99;
        const read = cow.body.actorTags;
        if (read !== undefined) read[1] = 99;

        expect([...(cow.body.actorTags ?? [])]).toEqual([10, 0, 0]);
        const [entry] = runtime.store.sealTick()?.entries ?? [];
        expect(entry?.kind === 'field' ? [...(entry.after instanceof Uint8Array ? entry.after : [])] : []).toEqual([
            10, 0, 0
        ]);
    });

    it('appends nothing for an idle world', () => {
        const { runtime } = fixture();
        runtime.spawn('minecraft:cow', GROUND);
        for (let tick = 1; tick <= 20; tick += 1) runtime.tick(tick);
        // The spawn and the settling, made between ticks, open the first tick.
        runtime.store.beginTick();
        runtime.store.sealTick();
        runtime.store.beginTick();
        for (let tick = 21; tick <= 40; tick += 1) runtime.tick(tick);

        expect(runtime.store.sealTick()?.entries).toEqual([]);
    });

    it('holds the state entries made between ticks for the next tick, ahead of its own', () => {
        const { runtime } = fixture();
        const cow = runtime.spawn('minecraft:cow', GROUND);
        if (cow === undefined) throw new Error('the fixture spawns cows');
        const { unlogged } = runtime.store.counts();

        runtime.store.writtenBlock(1, 64, 1, 0, 0, 5);
        runtime.store.occurred({
            kind: 'occurrence',
            occurrence: 'block-shown',
            data: { x: 2, y: 64, z: 2, block: 6 }
        });
        runtime.store.written(cow, 'tags', [], ['marked']);
        runtime.store.writtenSlot(cow.id, 'inventory', 0, null, { identifier: 'minecraft:stick', count: 1 });
        runtime.store.occurred({
            kind: 'occurrence',
            occurrence: 'action-rejected',
            data: { action: 'test', entity: BigInt(cow.id), guard: 'test' }
        });
        runtime.store.beginTick();
        runtime.store.writtenBlock(3, 64, 3, 0, 0, 7);

        // A vetoed action is the one entry that is not held.
        expect(runtime.store.counts().unlogged).toBe(unlogged + 1);
        const entries = runtime.store.sealTick()?.entries ?? [];
        expect(entries.map((entry) => (entry.kind === 'field' ? entry.field : entry.kind))).toEqual([
            'membership',
            'block',
            'occurrence',
            'entity',
            'inventory-slot',
            'block'
        ]);
        expect(entries[0]).toMatchObject({ kind: 'membership', change: 'enter', entity: BigInt(cow.id) });
        expect(entries.slice(1)).toEqual([
            { kind: 'field', field: 'block', address: { x: 1, y: 64, z: 1, layer: 0 }, before: 0, after: 5 },
            { kind: 'occurrence', occurrence: 'block-shown', data: { x: 2, y: 64, z: 2, block: 6 } },
            {
                kind: 'field',
                field: 'entity',
                address: { entity: BigInt(cow.id), field: 'tags' },
                before: [],
                after: ['marked']
            },
            {
                kind: 'field',
                field: 'inventory-slot',
                address: { entity: BigInt(cow.id), container: 'inventory', slot: 0 },
                before: null,
                after: { identifier: 'minecraft:stick', count: 1 }
            },
            { kind: 'field', field: 'block', address: { x: 3, y: 64, z: 3, layer: 0 }, before: 0, after: 7 }
        ]);
    });

    it('holds an occurrence replication sends between ticks for the next tick, and not a vetoed action', () => {
        const { runtime } = fixture();
        const { unlogged } = runtime.store.counts();

        runtime.store.occurred({
            kind: 'occurrence',
            occurrence: 'world-effect',
            data: { position: null, effect: 3001, data: 100 }
        });
        runtime.store.occurred({
            kind: 'occurrence',
            occurrence: 'action-rejected',
            data: { action: 'damage', entity: 1n, guard: 'plugin' }
        });
        runtime.store.beginTick();

        expect(runtime.store.counts().unlogged).toBe(unlogged + 1);
        expect(runtime.store.sealTick()?.entries).toEqual([
            { kind: 'occurrence', occurrence: 'world-effect', data: { position: null, effect: 3001, data: 100 } }
        ]);
    });

    it('keeps a stored stack from changing through the object its caller still holds', () => {
        const { runtime } = fixture();
        const entity = spawnLogged(runtime);
        const saddle = { identifier: 'minecraft:saddle', count: 1, lore: ['worn'] };
        const sword = { identifier: 'minecraft:iron_sword', count: 1, enchantments: { sharpness: 1 } };
        entity.body.setContainerSlot(1, saddle);
        entity.body.setEquipment({ mainhand: sword });

        // Strict mode turns a write to a frozen object into a throw, so a caller learns at once.
        expect(() => (saddle.count = 2)).toThrow(TypeError);
        expect(() => saddle.lore.push('torn')).toThrow(TypeError);
        expect(() => (sword.enchantments.sharpness = 5)).toThrow(TypeError);
        expect(entity.body.containerSlots[1]).toEqual({ identifier: 'minecraft:saddle', count: 1, lore: ['worn'] });
        expect(entity.body.equipment.mainhand?.enchantments).toEqual({ sharpness: 1 });
    });

    it('appends at most one position write per walking mob in a tick', () => {
        const { runtime } = fixture();
        const walkers = 6;
        for (let index = 0; index < walkers; index += 1)
            runtime.spawn('jsprismarine:wanderer', { x: index * 4 + 0.5, y: FLOOR_Y + 1, z: 0.5 });
        for (let tick = 1; tick <= 3; tick += 1) runtime.tick(tick);

        let moved = 0;
        for (let tick = 4; tick <= 40; tick += 1) {
            beginMeasuredTick(runtime.store);
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
        beginMeasuredTick(runtime.store);
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
            beginMeasuredTick(live.runtime.store);
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
                beginMeasuredTick(runtime.store);
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

        it('hands a player that keeps throwing to the host instead of removing it', () => {
            const world = new FaultyWorld();
            const { runtime, removed } = storePlayerFixture(world);
            const player = runtime.spawn(PLAYER_IDENTIFIER, { x: 20.5, y: FLOOR_Y + 1, z: 0.5 })!;
            const failed: { id: number; error: unknown }[] = [];
            runtime.onPlayerFailed = (entity, error) => failed.push({ id: entity.id, error });
            world.failing = (at) => Math.abs(at.x - 20) < 4;

            for (let tick = 1; tick <= ENTITY_FAILURE_LIMIT + 1; tick += 1) {
                beginMeasuredTick(runtime.store);
                runtime.tick(tick);
                runtime.store.sealTick();
                expect(failed).toHaveLength(Math.max(0, tick - ENTITY_FAILURE_LIMIT + 1));
            }

            expect(failed[0]?.id).toBe(player.id);
            expect(String(failed[0]?.error)).toContain('the block read failed');
            expect(runtime.store.has(player.id)).toBe(true);
            expect(removed).toEqual([]);
        });

        it('removes a player that keeps throwing when the host does not hear it', () => {
            const world = new FaultyWorld();
            const { runtime } = storePlayerFixture(world);
            const player = runtime.spawn(PLAYER_IDENTIFIER, { x: 20.5, y: FLOOR_Y + 1, z: 0.5 })!;
            world.failing = (at) => Math.abs(at.x - 20) < 4;

            for (let tick = 1; tick <= ENTITY_FAILURE_LIMIT; tick += 1) {
                beginMeasuredTick(runtime.store);
                runtime.tick(tick);
                runtime.store.sealTick();
            }

            expect(runtime.store.has(player.id)).toBe(false);
        });

        it('forgets a run of failures once an update finishes', () => {
            const world = new FaultyWorld();
            const { runtime } = entityFixture(world, {}, EXTRA);
            const entity = spawnLogged(runtime);
            for (let tick = 1; tick <= 20; tick += 1) {
                world.failing = (at) => tick % 2 === 0 && Math.abs(at.x) < 4;
                beginMeasuredTick(runtime.store);
                runtime.tick(tick);
                runtime.store.sealTick();
            }

            expect(runtime.store.has(entity.id)).toBe(true);
        });

        it('stops the pass when an inverse cannot be written, since the store can no longer be trusted', () => {
            const { runtime, reports } = entityFixture(undefined, {}, EXTRA);
            const entity = spawnLogged(runtime);
            entity.body.loveTicks = 1000;
            beginMeasuredTick(runtime.store);

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

    describe('runtime state an undo puts back', () => {
        const GRACED = { route: 'melee', graced: true } as const;

        /** A world whose `drop` throws while `failing` says so, as a death's loot can. */
        class FailingDropWorld extends TestEntityWorld {
            public failing = false;

            public override get host(): EntityHostFacts {
                const host = super.host;
                return {
                    ...host,
                    drop: (position, item) => {
                        if (this.failing) throw new Planned();
                        host.drop(position, item);
                    }
                };
            }
        }

        it('runs the undos a unit registered newest first, and only for the unit that threw', () => {
            const store = new EntityStore();
            const undone: string[] = [];
            store.beginTick();

            store.unit(() => store.undoWith(() => undone.push('finished')));
            store.unit(() => {
                store.undoWith(() => undone.push('outer first'));
                store.unit(() => store.undoWith(() => undone.push('inner finished')));
                store.unit(() => {
                    store.undoWith(() => undone.push('inner threw'));
                    throw new Planned();
                });
                store.undoWith(() => undone.push('outer last'));
                throw new Planned();
            });

            // An inner unit that finished hands its undos to the unit around it.
            expect(undone).toEqual(['inner threw', 'outer last', 'inner finished', 'outer first']);
        });

        it('lets a mob die again after the unit in which its death threw was undone', () => {
            const world = new FailingDropWorld();
            const { runtime } = entityFixture(world, {}, EXTRA);
            const entity = spawnLogged(runtime);
            entity.body.setContainerSlot(1, { identifier: 'minecraft:saddle', count: 1 });
            const lethal = {
                target: entity.id,
                cause: 'entity_attack',
                amount: 20,
                source: { route: 'command' }
            } as const;
            beginMeasuredTick(runtime.store);

            world.failing = true;
            const outcome = runtime.store.unit(() => void runtime.damage(lethal));
            expect(outcome.failed).toBe(true);
            expect(entity.instance.attributes.get('health')?.current).toBe(10);
            expect(runtime.store.has(entity.id)).toBe(true);

            world.failing = false;
            expect(runtime.damage(lethal)).toMatchObject({ committed: true, died: true });
            expect(runtime.store.has(entity.id)).toBe(false);
        });

        it('lets a graced blow land again after the unit it landed in was undone', () => {
            const { runtime } = fixture();
            const entity = spawnLogged(runtime);
            const blow = { target: entity.id, cause: 'entity_attack', amount: 3, source: GRACED } as const;
            beginMeasuredTick(runtime.store);

            runtime.store.unit(() => {
                expect(runtime.damage(blow)).toMatchObject({ committed: true, taken: 3 });
                throw new Planned();
            });
            expect(entity.instance.attributes.get('health')?.current).toBe(10);

            expect(runtime.damage(blow)).toMatchObject({ committed: true, taken: 3 });
        });

        it('keeps the grace an undone update counted down', () => {
            const world = new FaultyWorld();
            const { runtime } = entityFixture(world, {}, EXTRA);
            const entity = spawnLogged(runtime);
            const blow = { target: entity.id, cause: 'entity_attack', amount: 3, source: GRACED } as const;
            runtime.damage(blow);

            // Every other update throws once it has counted the grace down. Ten updates in all
            // would run a grace out, but only the five that finished count.
            for (let tick = 1; tick <= 10; tick += 1) {
                world.failing = () => tick % 2 === 0;
                beginMeasuredTick(runtime.store);
                runtime.tick(tick);
                runtime.store.sealTick();
            }
            world.failing = () => false;

            expect(runtime.store.has(entity.id)).toBe(true);
            expect(runtime.damage(blow)).toMatchObject({ committed: false, rejectedBy: 'hit_grace' });
        });

        it('keeps the grace of a mob whose removal was undone', () => {
            const { runtime } = fixture();
            const entity = spawnLogged(runtime);
            const blow = { target: entity.id, cause: 'entity_attack', amount: 3, source: GRACED } as const;
            runtime.damage(blow);
            beginMeasuredTick(runtime.store);

            runtime.store.unit(() => {
                runtime.remove(entity.id, 'test');
                throw new Planned();
            });

            expect(runtime.damage(blow)).toMatchObject({
                committed: false,
                rejectedBy: 'hit_grace'
            });
        });

        it('forgets who dealt a blow that was undone', () => {
            const { runtime } = fixture();
            const entity = spawnLogged(runtime);
            const attacker = spawnLogged(runtime, { x: 2.5, y: FLOOR_Y + 1, z: 0.5 });
            runtime.damage({ target: entity.id, cause: 'fall', amount: 1, source: { route: 'component' } });
            const before = entity.body.damage.records();
            beginMeasuredTick(runtime.store);

            runtime.store.unit(() => {
                runtime.damage({
                    target: entity.id,
                    attacker: attacker.id,
                    cause: 'entity_attack',
                    amount: 2,
                    source: { route: 'mob_attack' }
                });
                runtime.damage({ target: entity.id, cause: 'fall', amount: 1, source: { route: 'component' } });
                throw new Planned();
            });

            expect(entity.body.damage.records()).toEqual(before);
        });

        it('starts a fuse again whose first count an undone update made', () => {
            const { runtime } = entityFixture(
                undefined,
                {},
                {
                    ...EXTRA,
                    'jsprismarine:fused': {
                        components: {
                            'minecraft:health': { value: 10, max: 10 },
                            'minecraft:collision_box': { width: 0.6, height: 1.8 },
                            'minecraft:rideable': { seat_count: 1 }
                        },
                        component_groups: {
                            lit: { 'minecraft:explode': { fuse_lit: true, fuse_length: 1.5, power: 0 } }
                        },
                        events: { ignite: { add: { component_groups: ['lit'] } } }
                    }
                }
            );
            const fused = runtime.spawn('jsprismarine:fused', GROUND);
            if (fused === undefined) throw new Error('the fixture declares no jsprismarine:fused');
            const rider = spawnLogged(runtime, { x: 4.5, y: FLOOR_Y + 1, z: 4.5 });
            const vehicle = runtime.mobById(fused.id);
            if (vehicle === undefined) throw new Error('the vehicle is not in the store');
            runtime.mount(rider.body, vehicle);
            fused.instance.raise('ignite', 'self', 'test');
            fused.instance.applyQueuedEvents();
            expect(fused.body.fuseTicks).toBeUndefined();

            // Carrying the rider comes after the fuse in the vehicle's update, so the update has
            // started the fuse when this throws.
            let failing = true;
            const stopMoving = rider.body.stopMoving.bind(rider.body);
            rider.body.stopMoving = () => {
                if (failing) throw new Planned();
                stopMoving();
            };
            beginMeasuredTick(runtime.store);
            runtime.tick(1);
            runtime.store.sealTick();
            expect(fused.body.fuseTicks).toBeUndefined();

            failing = false;
            beginMeasuredTick(runtime.store);
            runtime.tick(2);
            runtime.store.sealTick();

            expect(fused.body.fuseTicks).toBe(29);
        });
    });

    describe('a slot written back by an undo', () => {
        /** A bare store whose undo writes slots back into `slots`, as a player's inventory does. */
        const slotStore = () => {
            const store = new EntityStore();
            const slots = new Map<string, PlainRecord | null>();
            store.addInverseWriter((inverse) => {
                if (inverse.kind !== 'field' || inverse.field !== 'inventory-slot') return false;
                slots.set(`${inverse.address.container}:${inverse.address.slot}`, inverse.after);
                return true;
            });
            const write = (container: string, slot: number, name: string) => {
                const before = slots.get(`${container}:${slot}`) ?? null;
                const after = { name, count: 1 };
                slots.set(`${container}:${slot}`, after);
                store.writtenSlot(7, container, slot, before, after);
            };
            return { store, slots, write };
        };
        const fail = () => {
            throw new Error('planned');
        };

        it('is shown to its owner once for each slot the unit wrote, in the order it wrote them', () => {
            const { store, slots, write } = slotStore();
            store.beginTick();

            const outcome = store.unit(() => {
                write('inventory', 4, 'minecraft:stone');
                write('cursor', 0, 'minecraft:torch');
                write('inventory', 4, 'minecraft:dirt');
                fail();
            });
            const sealed = store.sealTick();

            expect(outcome.failed).toBe(true);
            expect(slots.get('inventory:4')).toBeNull();
            expect(sealed?.entries).toEqual([
                { kind: 'occurrence', occurrence: 'slot-shown', data: { entity: 7n, container: 'inventory', slot: 4 } },
                { kind: 'occurrence', occurrence: 'slot-shown', data: { entity: 7n, container: 'cursor', slot: 0 } }
            ]);
        });

        it('is shown again when the unit around the undone one is undone in turn', () => {
            const { store, write } = slotStore();
            store.beginTick();

            store.unit(() => {
                store.unit(() => {
                    write('inventory', 1, 'minecraft:stone');
                    fail();
                });
                write('armor', 0, 'minecraft:iron_helmet');
                fail();
            });
            const sealed = store.sealTick();

            // The inner undo's occurrence went with the outer span, and the outer undo names it again.
            expect(sealed?.entries.map((entry) => (entry.kind === 'occurrence' ? entry.data : entry))).toEqual([
                { entity: 7n, container: 'inventory', slot: 1 },
                { entity: 7n, container: 'armor', slot: 0 }
            ]);
        });

        it('shows nothing for a unit that finishes, or one that wrote no slot', () => {
            const { store, write } = slotStore();
            store.beginTick();

            store.unit(() => write('inventory', 2, 'minecraft:stone'));
            store.unit(fail);
            const sealed = store.sealTick();

            expect(sealed?.entries.map((entry) => entry.kind)).toEqual(['field']);
        });
    });

    describe('work after a unit', () => {
        const fail = () => {
            throw new Error('planned');
        };

        it('runs once the unit has ended, told whether its writes were kept', () => {
            const store = new EntityStore();
            const heard: string[] = [];
            store.beginTick();

            store.unit(() => {
                store.afterUnit((kept) => void heard.push(`first ${kept}`));
                heard.push('inside');
            });
            store.unit(() => {
                store.afterUnit((kept) => void heard.push(`second ${kept}`));
                fail();
            });
            store.sealTick();

            expect(heard).toEqual(['inside', 'first true', 'second false']);
        });

        it('waits for the outermost unit, which can still undo what an inner one kept', () => {
            const store = new EntityStore();
            const heard: string[] = [];
            store.beginTick();

            store.unit(() => {
                store.unit(() => store.afterUnit((kept) => void heard.push(`kept inner ${kept}`)));
                store.unit(() => {
                    store.afterUnit((kept) => void heard.push(`undone inner ${kept}`));
                    fail();
                });
                store.afterUnit((kept) => void heard.push(`outer ${kept}`));
                heard.push('outer done');
            });
            store.unit(() => {
                store.unit(() => store.afterUnit((kept) => void heard.push(`under an undo ${kept}`)));
                fail();
            });
            store.sealTick();

            expect(heard).toEqual([
                'outer done',
                'kept inner true',
                'undone inner false',
                'outer true',
                'under an undo false'
            ]);
        });

        it('runs at once with no unit open, and reports a throw from inside a unit without stopping the rest', () => {
            const reported: string[] = [];
            const store = new EntityStore((message) => void reported.push(message));
            const heard: boolean[] = [];

            store.afterUnit((kept) => void heard.push(kept));
            expect(heard).toEqual([true]);
            expect(() => store.afterUnit(fail)).toThrow('planned');

            store.beginTick();
            store.unit(() => {
                store.afterUnit(fail);
                store.afterUnit((kept) => void heard.push(kept));
            });
            store.sealTick();

            expect(heard).toEqual([true, true]);
            expect(reported).toEqual(['Work after a unit failed: Error: planned']);
        });
    });
});
