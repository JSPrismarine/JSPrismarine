import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../../../.test/reportProgress';
import { buildServerContent } from '../../content/ServerContent';
import type { ServerContent } from '../../content/ServerContent';
import { singleDimension } from '../../content/world/adapter';
import { entityContentGroups } from '../../entity/contentAdapter';
import { entityViewOf } from '../../entity/data/actorView';
import type { DataEntity } from '../../entity/data/DataEntity';
import { EntityRuntime } from '../../entity/data/EntityRuntime';
import { entityFixture, FLOOR_Y, spawnDeclared, TestEntityWorld } from '../../entity/data/testing';
import { EntityReplica } from './EntityReplica';

/**
 * The entity replica holds what the change log says about each entity, and nothing else. The
 * proxy for "every field a client is shown has a logged home" is that the view folded from the
 * log equals the view a store actor makes from live state, for every entity, after every tick.
 */

const GROUND = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/** An entity type that carries the state the metadata projection reads. */
const EXTRA = {
    'jsprismarine:shown': {
        description: {
            identifier: 'jsprismarine:shown',
            is_spawnable: true,
            is_summonable: true,
            properties: { 'jsprismarine:mood': { type: 'int', range: [0, 5], default: 0, client_sync: true } }
        },
        components: {
            'minecraft:health': { value: 10, max: 10 },
            'minecraft:movement': { value: 0.25 },
            'minecraft:collision_box': { width: 0.6, height: 0.6 },
            'minecraft:leashable': {},
            'minecraft:navigation.walk': { can_swim: true }
        },
        component_groups: { grown: { 'minecraft:health': { value: 30, max: 30 }, 'minecraft:is_tamed': {} } },
        events: { grow: { add: { component_groups: ['grown'] } } }
    }
};

/** Runs one tick of the store around `work`, and reads the sealed tick into the replica. */
const tickInto = (runtime: EntityRuntime, replica: EntityReplica, work: () => void) => {
    runtime.store.beginTick();
    work();
    const sealed = runtime.store.sealTick();
    if (sealed === undefined) throw new Error('the tick did not seal');
    return replica.read(sealed);
};

/** Whether two values are deeply equal, as `toEqual` judges them. */
const same = (left: unknown, right: unknown): boolean => {
    try {
        expect(left).toEqual(right);
        return true;
    } catch {
        return false;
    }
};

/** One entity the replica answers differently from its live state. */
type Divergence = {
    readonly id: number;
    readonly identifier: string;
    /** The parts of the view that differ, or undefined when the replica holds no view at all. */
    readonly parts: Readonly<Record<string, { readonly live: unknown; readonly folded: unknown }>> | undefined;
};

/** Every live entity whose view the replica does not answer the same, with the parts that differ. */
const divergences = (runtime: EntityRuntime, replica: EntityReplica): Divergence[] =>
    [...runtime.store.values()].flatMap((entity: DataEntity): Divergence[] => {
        const live = entityViewOf(entity, runtime.leashHolderIdOf(entity.id));
        const folded = replica.view(BigInt(entity.id));
        if (folded === undefined) return [{ id: entity.id, identifier: entity.identifier, parts: undefined }];
        const parts = Object.fromEntries(
            Object.keys(live).flatMap((key) => {
                const mine: unknown = Reflect.get(folded, key);
                const theirs: unknown = Reflect.get(live, key);
                return same(mine, theirs) ? [] : [[key, { live: theirs, folded: mine }]];
            })
        );
        return Object.keys(parts).length === 0 ? [] : [{ id: entity.id, identifier: entity.identifier, parts }];
    });

describe('the entity replica', () => {
    it('folds the view a store actor shows from live state, tick by tick', () => {
        const { runtime, content } = entityFixture(new TestEntityWorld({ random: [0.95, 0.5, 0.5, 0.1] }), {}, EXTRA);
        const replica = new EntityReplica(() => content);
        const spawned: DataEntity[] = [];
        const spawn = (identifier: string, at = GROUND) => {
            const entity = runtime.spawn(identifier, at);
            if (entity === undefined) throw new Error(`the fixture declares no ${identifier}`);
            spawned.push(entity);
            return entity;
        };

        tickInto(runtime, replica, () => {
            spawn('jsprismarine:shown');
            spawn('jsprismarine:shown', { x: 3.5, y: FLOOR_Y + 1, z: 0.5 });
            for (let index = 0; index < 3; index++)
                spawn('jsprismarine:wanderer', { x: index * 3 + 0.5, y: FLOOR_Y + 1, z: 6.5 });
        });
        expect(divergences(runtime, replica)).toEqual([]);

        const [shown, holder] = spawned;
        if (shown === undefined || holder === undefined) throw new Error('nothing spawned');
        const writes: ((tick: number) => void)[] = [
            () => (shown.body.nameTag = 'Shown'),
            () => (shown.body.color = 4),
            () => (shown.body.fireTicks = 40),
            () => shown.body.conditions.add('in_water'),
            () => (shown.body.owner = holder.id),
            () => runtime.attachLead(shown.id, holder.id),
            () => shown.instance.properties.set('jsprismarine:mood', 3),
            () => {
                shown.instance.raise('grow', 'self', 'test');
                shown.instance.applyQueuedEvents();
            },
            () => shown.instance.attributes.set('health', 4),
            () =>
                shown.body.statusEffects.set('minecraft:speed', {
                    id: 'minecraft:speed',
                    amplifier: 1,
                    durationTicks: 100,
                    ambient: false,
                    showParticles: true,
                    showIcon: true
                }),
            () => (shown.body.beamTarget = { x: 1.5, y: 70.2, z: -3.5 }),
            () => (shown.body.fuseTicks = 30),
            () => runtime.remove(holder.id, 'test')
        ];
        for (let tick = 1; tick <= 30; tick++) {
            tickInto(runtime, replica, () => {
                writes[tick - 1]?.(tick);
                runtime.tick(tick);
            });
            expect({ tick, divergences: divergences(runtime, replica) }).toEqual({ tick, divergences: [] });
        }
        expect(replica.has(BigInt(holder.id))).toBe(false);
        expect(replica.view(BigInt(shown.id))?.metadata.properties).toContainEqual({
            kind: 'string',
            id: expect.any(Number),
            value: 'Shown'
        });
    });

    it('visits the entities a tick wrote, whatever number it holds', () => {
        const visited = (held: number) => {
            const { runtime, content } = entityFixture(new TestEntityWorld(), {}, EXTRA);
            const replica = new EntityReplica(() => content);
            const entities: DataEntity[] = [];
            tickInto(runtime, replica, () => {
                for (let index = 0; index < held; index++) {
                    const entity = runtime.spawn('jsprismarine:shown', { x: index * 2 + 0.5, y: FLOOR_Y + 1, z: 0.5 });
                    if (entity !== undefined) entities.push(entity);
                }
            });
            const before = replica.counts().entriesRead;
            const changes = tickInto(runtime, replica, () => {
                for (const entity of entities.slice(0, 2)) entity.body.nameTag = 'written';
            });
            return {
                held: replica.counts().entities,
                read: replica.counts().entriesRead - before,
                changed: changes.fields.size
            };
        };

        expect(visited(3)).toEqual({ held: 3, read: 2, changed: 2 });
        expect(visited(300)).toEqual({ held: 300, read: 2, changed: 2 });
    });

    it('holds an entity that entered between ticks from the next tick, with what it wrote since', () => {
        const { runtime, content } = entityFixture(new TestEntityWorld(), {}, EXTRA);
        const replica = new EntityReplica(() => content);
        // Spawned and named with no tick open: the store holds both entries for the next tick.
        const entity = runtime.spawn('jsprismarine:shown', GROUND);
        if (entity === undefined) throw new Error('the fixture declares no jsprismarine:shown');
        entity.body.nameTag = 'Between';

        const changes = tickInto(runtime, replica, () => undefined);

        expect([...changes.entered]).toEqual([BigInt(entity.id)]);
        expect(replica.view(BigInt(entity.id))).toEqual(entityViewOf(entity, runtime.leashHolderIdOf(entity.id)));
    });

    it('passes over an entry for an entity whose entering entry it never read', () => {
        const { content } = entityFixture(new TestEntityWorld(), {}, EXTRA);
        const replica = new EntityReplica(() => content);

        const changes = replica.read({
            tick: 1,
            entries: [
                {
                    kind: 'field',
                    field: 'entity',
                    address: { entity: 7n, field: 'nameTag' },
                    before: null,
                    after: 'unseen'
                }
            ]
        });

        expect(replica.view(7n)).toBeUndefined();
        expect(changes.fields.size).toBe(0);
    });
});

describe.skipIf(!process.env.JSP_CONTENT_VANILLA)(
    'the entity replica over every vanilla entity definition',
    { tags: ['real-data'] },
    () => {
        it('folds the view each vanilla entity shows from live state, tick by tick', () => {
            const world = new TestEntityWorld();
            let content: ServerContent | undefined;
            const runtime = new EntityRuntime({
                content: () => {
                    if (content === undefined) throw new Error('the runtime read content before the build finished');
                    return content;
                },
                world: world.world,
                host: world.host,
                report: () => undefined
            });
            const adapter = { ...world.world, ticks: world.ticks, ...entityContentGroups(runtime) };
            const built = buildServerContent({ world: singleDimension(adapter) });
            content = built;
            const replica = new EntityReplica(() => built);
            const identifiers = built.entities.registry
                .keys()
                .filter((identifier) => identifier !== 'minecraft:player');

            tickInto(runtime, replica, () =>
                identifiers.forEach((identifier, index) =>
                    spawnDeclared(runtime, identifier, {
                        x: (index % 16) * 4 + 0.5,
                        y: FLOOR_Y + 1,
                        z: Math.floor(index / 16) * 4 + 0.5
                    })
                )
            );
            const failures = new Map<string, unknown>();
            const check = (tick: number) => {
                for (const divergence of divergences(runtime, replica))
                    if (!failures.has(divergence.identifier))
                        failures.set(divergence.identifier, { tick, ...divergence });
            };
            check(0);
            for (let tick = 1; tick <= 20; tick++) {
                tickInto(runtime, replica, () => runtime.tick(tick));
                check(tick);
            }

            const counts = replica.counts();
            reportProgress(
                `entity replica over ${identifiers.length} vanilla types and 20 ticks: ${counts.entities} entities in ${counts.bytes} bytes; ` +
                    `${counts.entriesRead} entries read and ${counts.views} views built`,
                'Entity replica cost'
            );
            expect(counts.entities).toBe(runtime.store.size);
            expect([...failures.values()]).toEqual([]);
        });
    }
);
