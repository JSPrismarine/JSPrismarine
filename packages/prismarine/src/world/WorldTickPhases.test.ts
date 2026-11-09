import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it, vi } from 'vitest';

import { Attributes, AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { Entity } from '../entity/Entity';
import type PlayerSession from '../network/PlayerSession';
import Player from '../Player';
import { stub, stubOf } from '../testing/stub.test.helper';
import type { DimensionTravel, PortalBlockRef } from './portal/DimensionTravel';
import type { SystemBlock } from './WorldSystems';
import BlockUpdateScheduler from './BlockUpdateScheduler';
import { Dimensions } from './Dimension';
import EntityGrid from './EntityGrid';
import { Position } from './Position';
import type { WorldChangeSink } from './WorldChangeSink';
import { World } from './World';
import { inertEntityRuntime } from '../testing/entityServer';
import { fakeLevel } from '../testing/level';
import { attachProfiler, ServerProfiler } from '../profiling/ServerProfiler';
import type GameRuleManager from './GameRuleManager';
import type BaseProvider from './providers/BaseProvider';

/**
 * The order a tick reports what happened in it.
 *
 * Not decoration: an entity that came into range this tick has to be spawned before the first
 * packet that says it moved, or the client is told a runtime id it was never given and throws
 * the movement away. The phases used to be inlined in `World.update` as direct reach-through
 * into every player's session; now they go out through {@link WorldChangeSink}, and this is
 * what stops the move from having quietly reordered them.
 */
const worldTicking = ({
    trackingInterval = 1,
    currentTick = 20,
    entities = [],
    entityAttributesChanged,
    blockAt = () => ({ name: 'minecraft:air', states: {} }),
    travel
}: {
    trackingInterval?: number;
    currentTick?: number;
    entities?: Entity[];
    entityAttributesChanged?: WorldChangeSink['entityAttributesChanged'];
    /** What stands at a block, for the portal check; air everywhere by default. */
    blockAt?: (x: number, y: number, z: number) => SystemBlock | undefined;
    /** The travel service the world reports portal contacts to. */
    travel?: DimensionTravel;
} = {}) => {
    const calls: string[] = [];

    const record =
        (name: string) =>
        async (...args: unknown[]) => {
            calls.push(name);
            void args;
        };

    const sink: WorldChangeSink = {
        worldChanged: (change) => calls.push(`worldChanged:${change.kind}`),
        blockSound: () => calls.push('blockSound'),
        namedSound: () => calls.push('namedSound'),
        namedParticle: () => calls.push('namedParticle'),
        actorSound: () => calls.push('actorSound'),
        worldEffect: () => calls.push('worldEffect'),
        entityMoved: () => calls.push('entityMoved'),
        entityAttributesChanged: entityAttributesChanged ?? record('entityAttributesChanged'),
        entityMetadataChanged: record('entityMetadataChanged'),
        entityEquipmentChanged: record('entityEquipmentChanged'),
        actorEffect: record('actorEffect'),
        entityAdded: record('entityAdded'),
        entityRemoved: record('entityRemoved'),
        timeChanged: record('timeChanged'),
        gameRuleChanged: record('gameRuleChanged'),
        reconcile: record('reconcile'),
        flushBlockChanges: record('flushBlockChanges'),
        flushBlockEntities: record('flushBlockEntities'),
        flushMovement: record('flushMovement')
    };

    const server = {
        getConfig: () => ({ getEntityTrackingInterval: () => trackingInterval }),
        getLogger: () => ({ verbose: () => {}, error: () => {}, warn: () => {} }),
        // Inert: this file is about the order of the phases, not about what a mob does
        // inside one, and the data runtime's own tick is covered by `live.test.ts`.
        getEntityRuntime: () => inertEntityRuntime(),
        getDimensionTravel: () => travel
    };

    // Built on the real prototype, so `update` is the code under test rather than more of the
    // stand-in. Only what would reach the disk, a chunk or the network is replaced.
    const runtimeIds = new Map<string, number>();
    const world: World = Object.assign(Object.create(World.prototype), {
        entities: new Map(),
        players: new Map(),
        chunks: new Map(),
        name: 'tick-test-world',
        // The real one: it is ordinary in-memory bookkeeping, and a tick rebuilds it. Only what
        // would reach the disk, a chunk or the network is stood in for.
        entityGrid: new EntityGrid(),
        // The level's clock stands on the second the time is put on the wire, so that the
        // phase runs at all: it is sent once a second rather than every tick. Chunk unloading
        // is outside the phase ordering this fixture exercises.
        level: fakeLevel({
            ticks: currentTick,
            gameRules: stub<GameRuleManager>({ getGameRule: () => [true, true] as const }),
            provider: stub<BaseProvider>({ supportsChunkUnload: false })
        }),
        dimension: Dimensions.Overworld,
        getEntities: () => entities,
        getPlayers: () => [],
        loadedBlockAt: blockAt,
        // A runtime id names one block, so the stand-in numbers each name the first time it is read.
        loadedBlockRuntimeIdAt: (x: number, y: number, z: number) => {
            const name = blockAt(x, y, z)?.name;
            if (name === undefined) return undefined;
            if (!runtimeIds.has(name)) runtimeIds.set(name, runtimeIds.size);
            return runtimeIds.get(name);
        },
        runBlockUpdates: async () => void calls.push('blockUpdates'),
        systems: { tick: () => void calls.push('systems') },
        save: async () => {},
        server
    });

    world.attachChangeSink(sink);

    return { world, calls, server };
};

const dirtyEntity = (world: World) => {
    const attributes = new Attributes();
    attributes.setValue(AttributeIds.Health, 19);
    const position = new Position(0, 64, 0, world);
    const entity = stub<Entity>({
        attributes,
        getPosition: () => position,
        getType: () => 'minecraft:cow',
        update: async () => {}
    });

    return { entity, attributes };
};

describe('world', () => {
    describe('tick phases', () => {
        it('reconciles what is visible before the movement goes out', async () => {
            const { world, calls } = worldTicking();

            await world.update(1);

            // The whole point of the ordering: spawn first, then say it moved.
            expect(calls.indexOf('reconcile')).toBeGreaterThan(-1);
            expect(calls.indexOf('reconcile')).toBeLessThan(calls.indexOf('flushMovement'));
        });

        it('runs block updates and entities before either', async () => {
            // A mob has to walk on the world as it is this tick, and everything has to have
            // finished moving before anyone works out what is visible.
            const { world, calls } = worldTicking();

            await world.update(1);

            expect(calls).toStrictEqual([
                'blockUpdates',
                'systems',
                'reconcile',
                'flushBlockChanges',
                'flushBlockEntities',
                'flushMovement',
                'timeChanged'
            ]);
        });

        it('finishes entity updates in roster order before starting the next entity', async () => {
            const started: string[] = [];
            let firstFinished = false;
            let finishFirst = () => {};
            let signalFirstStarted = () => {};
            const firstUpdateGate = new Promise<void>((resolve) => {
                finishFirst = resolve;
            });
            const firstUpdateStarted = new Promise<void>((resolve) => {
                signalFirstStarted = resolve;
            });
            const { world } = worldTicking({
                entities: [
                    stubOf(Player, {
                        getPosition: () => new Position(0, 64, 0, world),
                        getType: () => 'minecraft:player',
                        getRuntimeId: () => 1n,
                        claimUpdate: () => true,
                        update: async () => {
                            started.push('first');
                            signalFirstStarted();
                            await firstUpdateGate;
                            firstFinished = true;
                        }
                    }),
                    stubOf(Player, {
                        getPosition: () => new Position(0, 64, 0, world),
                        getType: () => 'minecraft:player',
                        getRuntimeId: () => 2n,
                        claimUpdate: () => true,
                        update: async () => {
                            started.push('second');
                            expect(firstFinished).toBe(true);
                        }
                    })
                ]
            });
            Object.assign(world, {
                touchPortals: async () => {},
                flushEntityAttributes: async () => {},
                updateTracking: async () => {}
            });

            const update = world.update(1);
            await firstUpdateStarted;
            // Keep the first callback suspended while proving the next roster entry has not started.
            expect(started).toEqual(['first']);
            finishFirst();
            await update;

            expect(started).toEqual(['first', 'second']);
        });

        it('uses the roster insertion order that Java 26.3 entity ticks preserve', async () => {
            const started: bigint[] = [];
            const firstInserted = stubOf(Player, {
                getPosition: () => new Position(0, 64, 0, world),
                getType: () => 'minecraft:player',
                getRuntimeId: () => 2n,
                claimUpdate: () => true,
                update: async () => {
                    started.push(2n);
                }
            });
            const secondInserted = stubOf(Player, {
                getPosition: () => new Position(0, 64, 0, world),
                getType: () => 'minecraft:player',
                getRuntimeId: () => 1n,
                claimUpdate: () => true,
                update: async () => {
                    started.push(1n);
                }
            });
            const { world } = worldTicking({ entities: [firstInserted, secondInserted] });
            Object.assign(world, {
                entities: new Map([
                    [2, firstInserted],
                    [1, secondInserted]
                ]),
                getEntities: World.prototype.getEntities,
                touchPortals: async () => {},
                flushEntityAttributes: async () => {},
                updateTracking: async () => {}
            });

            // Java 26.3 EntityTickList uses Int2ObjectLinkedOpenHashMap and iterates its values.
            await world.update(1);

            expect(started).toEqual([2n, 1n]);
        });

        it('closes every world profiling span when profiling is enabled', async () => {
            const directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-world-profile-'));
            vi.stubEnv('JSP_DIR', directory);
            const { world, server } = worldTicking();
            const profiler = new ServerProfiler();
            attachProfiler(server, profiler);

            try {
                await world.update(1);
                const file = await profiler.save();
                if (file === undefined) throw new Error('world update wrote no profile spans');
                // The trace is parsed JSON written by ServerProfiler.save, so its shape is a boundary.
                const trace = JSON.parse(readFileSync(file, 'utf8')) as {
                    traceEvents: Array<{ dur?: number; name?: string; ph?: string }>;
                };
                const spans = trace.traceEvents.filter((event) => event.ph === 'X');
                const names = spans.map((span) => span.name);

                expect(names).toEqual(
                    expect.arrayContaining([
                        'World.autosave:tick-test-world',
                        'World.blockUpdates:tick-test-world',
                        'World.systems:tick-test-world',
                        'World.entityGrid:tick-test-world',
                        'World.portalContacts:tick-test-world',
                        'World.dragonFight:tick-test-world',
                        'World.entityUpdates:tick-test-world',
                        'World.dataEntities:tick-test-world',
                        'World.entityAttributes:tick-test-world',
                        'World.entityTracking:tick-test-world',
                        'World.blockChanges:tick-test-world',
                        'World.blockEntities:tick-test-world',
                        'World.movement:tick-test-world',
                        'World.time:tick-test-world',
                        'World.unloadChunks:tick-test-world'
                    ])
                );
                expect(spans.every((span) => span.dur !== undefined && span.dur >= 0)).toBe(true);
            } finally {
                vi.unstubAllEnvs();
                rmSync(directory, { recursive: true, force: true });
            }
        });

        it('runs synchronous physics updates in due order without introducing async work between them', async () => {
            const { world } = worldTicking();
            const blockUpdates = new BlockUpdateScheduler();
            const updated: number[] = [];
            for (let x = 0; x < 3; x++) blockUpdates.schedule(x, 64, 0, 0);
            Object.assign(world, {
                blockUpdates,
                physics: { update: (x: number) => void updated.push(x) }
            });
            // Bypass the fixture's phase logger so this exercises the real scheduled updates.
            Reflect.deleteProperty(world, 'runBlockUpdates');

            await world.update(1);

            expect(updated).toEqual([0, 1, 2]);
        });

        it('waits for each asynchronous physics update before starting the next one', async () => {
            const { world } = worldTicking();
            const blockUpdates = new BlockUpdateScheduler();
            const updated: string[] = [];
            let releaseFirst!: () => void;
            const firstUpdate = new Promise<void>((resolve) => {
                releaseFirst = resolve;
            });
            for (let x = 0; x < 2; x++) blockUpdates.schedule(x, 64, 0, 0);
            Object.assign(world, {
                blockUpdates,
                physics: {
                    update: (x: number) => {
                        updated.push(`start:${x}`);
                        if (x === 0) {
                            return firstUpdate.then(() => {
                                updated.push('finish:0');
                            });
                        }
                        updated.push(`finish:${x}`);
                    }
                }
            });
            // Bypass the fixture's phase logger so this exercises the real scheduled updates.
            Reflect.deleteProperty(world, 'runBlockUpdates');

            const tick = world.update(1);
            expect(updated).toEqual(['start:0']);
            releaseFirst();
            await tick;

            expect(updated).toEqual(['start:0', 'finish:0', 'start:1', 'finish:1']);
        });

        it("sends the tick's block changes before the block entities standing in them", async () => {
            // A client drops a block entity update for a position it has no block entity at,
            // and an `UpdateBlockPacket` arriving afterwards makes it rebuild the block entity
            // from its own empty data. Either way round, a chest placed and filled in one tick
            // would reach the player empty.
            const { world, calls } = worldTicking();

            await world.update(1);

            expect(calls.indexOf('flushBlockChanges')).toBeLessThan(calls.indexOf('flushBlockEntities'));
        });

        it("sends the tick's block changes before the movement over them", async () => {
            // A mob reported walking on ground the client has not been told about yet is a mob
            // standing in mid air until the next batch lands.
            const { world, calls } = worldTicking();

            await world.update(1);

            expect(calls.indexOf('flushBlockChanges')).toBeLessThan(calls.indexOf('flushMovement'));
        });

        it('flushes movement every tick, even on ticks with no visibility pass', async () => {
            // Reconciliation is on an interval because it is O(players x entities); movement
            // is not, and a tick that skipped the flush would hold a move back by a tick.
            const { world, calls } = worldTicking({ trackingInterval: 4 });

            await world.update(1);

            expect(calls).not.toContain('reconcile');
            expect(calls).toContain('flushMovement');
        });

        it('continues flushing later attributes after a synchronous sink failure', async () => {
            const entities: Entity[] = [];
            const sent: Entity[] = [];
            let failingEntity: Entity | undefined;
            const { world } = worldTicking({
                entities,
                entityAttributesChanged: (entity) => {
                    sent.push(entity);
                    if (entity === failingEntity) throw new Error('attribute sink failed');
                    return Promise.resolve();
                }
            });
            const first = dirtyEntity(world);
            const second = dirtyEntity(world);
            const third = dirtyEntity(world);
            failingEntity = second.entity;
            entities.push(first.entity, second.entity, third.entity);

            await expect(world.update(1)).rejects.toThrow('attribute sink failed');

            expect(sent).toEqual([first.entity, second.entity, third.entity]);
            expect([first, second, third].map(({ attributes }) => attributes.getDirty())).toEqual([[], [], []]);
        });
    });
});

describe('world portal contacts', () => {
    /** A standing player, 0.6 wide and 1.8 tall, whose feet are at `feet`. */
    const standingAt = (feet: Vector3, onCooldown = false): Entity => {
        const position = new Position(feet.getX(), feet.getY() + 1.62, feet.getZ(), stub<World>());
        return stubOf(Player, {
            attributes: new Attributes(),
            getPosition: () => position,
            getFeetY: () => feet.getY(),
            getBox: () => ({ width: 0.6, height: 1.8 }),
            isOnPortalCooldown: () => onCooldown,
            // A settled client: no world change is waiting on its loading screen.
            getNetworkSession: () => stub<PlayerSession>({ pendingDimensionChange: () => undefined }),
            getType: () => 'minecraft:player',
            update: async () => {}
        });
    };

    /** A world whose only non-air block is a portal at `portal`. */
    const portalOnlyAt =
        (portal: Vector3) =>
        (x: number, y: number, z: number): SystemBlock =>
            x === portal.getX() && y === portal.getY() && z === portal.getZ()
                ? { name: 'minecraft:portal', states: { portal_axis: 'x' } }
                : { name: 'minecraft:air', states: {} };

    it('touches the travel service for a body overlapping a portal block at head height only', async () => {
        const touch = vi.fn<DimensionTravel['touch']>();
        const player = standingAt(new Vector3(10.5, 64, 10.5));
        const { world } = worldTicking({
            entities: [player],
            blockAt: portalOnlyAt(new Vector3(10, 65, 10)),
            travel: stub<DimensionTravel>({ touch })
        });

        await world.update(1);

        expect(touch).toHaveBeenCalledTimes(1);
        const [touched, portal] = touch.mock.calls[0]!;
        expect(touched).toBe(player);
        expect(portal).toMatchObject<Partial<PortalBlockRef>>({
            world,
            position: new Vector3(10, 65, 10),
            block: 'minecraft:portal'
        });
    });

    it('does not count the block a body only rests on the boundary of', async () => {
        const touch = vi.fn<DimensionTravel['touch']>();
        // Feet at exactly 64: the body spans 64 and 65, not 66, and across x spans 10 only.
        const player = standingAt(new Vector3(10.5, 64, 10.5));
        const { world } = worldTicking({
            entities: [player],
            blockAt: (x, y, z) =>
                portalOnlyAt(new Vector3(10, 66, 10))(x, y, z).name === 'minecraft:portal' ||
                portalOnlyAt(new Vector3(11, 64, 10))(x, y, z).name === 'minecraft:portal'
                    ? { name: 'minecraft:portal', states: {} }
                    : { name: 'minecraft:air', states: {} },
            travel: stub<DimensionTravel>({ touch })
        });

        await world.update(1);

        expect(touch).not.toHaveBeenCalled();
    });

    it('dispatches the touch for an entity on portal cooldown, whose touch winds the cooldown back', async () => {
        const touch = vi.fn<DimensionTravel['touch']>();
        const player = standingAt(new Vector3(10.5, 64, 10.5), true);
        const { world } = worldTicking({
            entities: [player],
            blockAt: portalOnlyAt(new Vector3(10, 64, 10)),
            travel: stub<DimensionTravel>({ touch })
        });

        await world.update(1);

        expect(touch).toHaveBeenCalledTimes(1);
    });
});
