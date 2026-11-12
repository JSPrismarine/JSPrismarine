import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it, vi } from 'vitest';

import type { DataEntity } from '../entity/data/DataEntity';
import type { StoreActors } from '../entity/data/storeActors';
import { StoreActor } from '../entity/data/storeActors';
import type PlayerSession from '../network/PlayerSession';
import { stub, stubOf } from '../testing/stub.test.helper';
import type { DimensionTravel, PortalBlockRef } from './portal/DimensionTravel';
import type { SystemBlock } from './WorldSystems';
import BlockUpdateScheduler from './BlockUpdateScheduler';
import { Dimensions } from './DimensionType';
import { Position } from './Position';
import type { WorldChangeSink } from './WorldChangeSink';
import { World } from './World';
import { inertEntityRuntime } from '../testing/entityServer';
import { fakeLevel } from '../testing/level';
import { attachProfiler, ServerProfiler } from '../profiling/ServerProfiler';
import type GameRuleManager from './GameRuleManager';
import type BaseProvider from './providers/BaseProvider';
import { QUIET_TICK_HEADER } from '../testing/tickHeader.test.helper';

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
    blockAt = () => ({ name: 'minecraft:air', states: {} }),
    travel
}: {
    trackingInterval?: number;
    currentTick?: number;
    entities?: StoreActor[];
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
        tickSealed: () => calls.push('tickSealed'),
        chunkEntered: () => calls.push('chunkEntered'),
        chunkLeft: () => calls.push('chunkLeft'),
        entityMoved: () => calls.push('entityMoved'),
        timeChanged: record('timeChanged'),
        gameRuleChanged: record('gameRuleChanged'),
        flushEntities: record('flushEntities'),
        reconcile: record('reconcile'),
        flushOccurrences: record('flushOccurrences'),
        flushDepartures: record('flushDepartures'),
        flushOwnerViews: record('flushOwnerViews'),
        shownEntities: () => [],
        flushBlockChanges: record('flushBlockChanges'),
        flushBlockEntities: record('flushBlockEntities'),
        flushMovement: record('flushMovement')
    };

    // The store's actors are the entities the tick walks, in the order they were given.
    const live = Object.assign(inertEntityRuntime(), {
        actors: stub<StoreActors>({
            all: () => new Map(entities.map((entity) => [Number(entity.getRuntimeId()), entity])).values(),
            actorOf: (id) => entities.find((entity) => entity.getRuntimeId() === BigInt(id))
        })
    });
    const server = {
        getConfig: () => ({ getEntityTrackingInterval: () => trackingInterval }),
        getLogger: () => ({ verbose: () => {}, error: () => {}, warn: () => {} }),
        // Inert: this file is about the order of the phases, not about what a mob does
        // inside one, and the data runtime's own tick is covered by `live.test.ts`.
        getEntityRuntime: () => live,
        hasEntityRuntime: () => true,
        getDimensionTravel: () => travel
    };

    // Built on the real prototype, so `update` is the code under test rather than more of the
    // stand-in. Only what would reach the disk, a chunk or the network is replaced.
    const runtimeIds = new Map<string, number>();
    const world: World = Object.assign(Object.create(World.prototype), {
        tickHeader: () => QUIET_TICK_HEADER,
        players: new Map(),
        chunks: new Map(),
        name: 'tick-test-world',
        // The level's clock stands on the second the time is put on the wire, so that the
        // phase runs at all: it is sent once a second rather than every tick. Chunk unloading
        // is outside the phase ordering this fixture exercises.
        level: fakeLevel({
            ticks: currentTick,
            gameRules: stub<GameRuleManager>({ getGameRule: () => [true, true] as const }),
            provider: stub<BaseProvider>({ supportsChunkUnload: false })
        }),
        dimension: Dimensions.Overworld,
        loadedBlockAt: blockAt,
        // A runtime id names one block, so the stand-in numbers each name the first time it is read.
        loadedBlockRuntimeIdAt: (x: number, y: number, z: number) => {
            const name = blockAt(x, y, z)?.name;
            if (name === undefined) return undefined;
            if (!runtimeIds.has(name)) runtimeIds.set(name, runtimeIds.size);
            return runtimeIds.get(name);
        },
        runBlockUpdates: () => void calls.push('blockUpdates'),
        systems: { tick: () => void calls.push('systems') },
        save: async () => {},
        server
    });

    world.attachChangeSink(sink);

    return { world, calls, server };
};

/** A store entity's actor, standing where `members.getPosition` says, of `members.getType`'s type. */
const actorOf = (members: Parameters<typeof stubOf<StoreActor>>[1] & Pick<StoreActor, 'getPosition' | 'getType'>) => {
    const actor = stubOf(StoreActor, members);
    // The tick reads the store entity behind the actor for its type and where it stands.
    Object.defineProperty(actor, 'entity', {
        get: () => {
            const at = members.getPosition();
            return stub<DataEntity>({
                id: Number(actor.getRuntimeId()),
                identifier: members.getType(),
                position: { x: at.getX(), y: at.getY(), z: at.getZ() }
            });
        }
    });
    return actor;
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
                'tickSealed',
                'flushEntities',
                'flushOccurrences',
                'flushDepartures',
                'flushOwnerViews',
                'reconcile',
                'flushBlockChanges',
                'flushBlockEntities',
                'flushMovement',
                'timeChanged'
            ]);
        });

        it('runs each entity update to its end, in roster order, before the next one starts', async () => {
            const steps: string[] = [];
            const updating = (name: string) => () => {
                steps.push(`start:${name}`);
                steps.push(`finish:${name}`);
            };
            const { world } = worldTicking({
                entities: [
                    actorOf({
                        getPosition: () => new Position(0, 64, 0, world),
                        getType: () => 'minecraft:player',
                        getRuntimeId: () => 1n,
                        claimUpdate: () => true,
                        update: updating('first')
                    }),
                    actorOf({
                        getPosition: () => new Position(0, 64, 0, world),
                        getType: () => 'minecraft:player',
                        getRuntimeId: () => 2n,
                        claimUpdate: () => true,
                        update: updating('second')
                    })
                ]
            });
            Object.assign(world, {
                touchPortals: () => {},
                updateTracking: async () => {}
            });

            const update = world.update(1);
            // Both ran before the update's first wait, which is now only replication's.
            expect(steps).toEqual(['start:first', 'finish:first', 'start:second', 'finish:second']);
            await update;
        });

        it('ticks its entities without copying the whole entity list for an index', async () => {
            const updated: bigint[] = [];
            const player = actorOf({
                getPosition: () => new Position(0, 64, 0, world),
                getType: () => 'minecraft:player',
                getRuntimeId: () => 1n,
                claimUpdate: () => true,
                update: async () => void updated.push(1n)
            });
            const { world } = worldTicking({ entities: [player] });
            // The passes that still read every entity stood in for, so what is left is the entity
            // loop, and nothing has to rebuild an index for it.
            Object.assign(world, {
                touchPortals: () => {},
                updateTracking: async () => {}
            });
            const copies = vi.spyOn(world, 'getActors');
            const shown = vi.spyOn(world, 'shownEntities');

            await world.update(1);

            expect(updated).toEqual([1n]);
            // The loop walks the store's actors in place.
            expect(copies).not.toHaveBeenCalled();
            expect(shown).not.toHaveBeenCalled();
        });

        it('uses the roster insertion order that Java 26.3 entity ticks preserve', async () => {
            const started: bigint[] = [];
            const firstInserted = actorOf({
                getPosition: () => new Position(0, 64, 0, world),
                getType: () => 'minecraft:player',
                getRuntimeId: () => 2n,
                claimUpdate: () => true,
                update: async () => {
                    started.push(2n);
                }
            });
            const secondInserted = actorOf({
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
                touchPortals: () => {},
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
                        'World.portalContacts:tick-test-world',
                        'World.dragonFight:tick-test-world',
                        'World.entityUpdates:tick-test-world',
                        'World.dataEntities:tick-test-world',
                        'World.entities:tick-test-world',
                        'World.occurrences:tick-test-world',
                        'World.departures:tick-test-world',
                        'World.ownerViews:tick-test-world',
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

        it('runs the due physics updates in order, each to its end, before the update first waits', async () => {
            const { world } = worldTicking();
            const blockUpdates = new BlockUpdateScheduler();
            const updated: string[] = [];
            for (let x = 0; x < 2; x++) blockUpdates.schedule(x, 64, 0, 0);
            Object.assign(world, {
                blockUpdates,
                physics: {
                    update: (x: number) => {
                        updated.push(`start:${x}`);
                        updated.push(`finish:${x}`);
                    }
                }
            });
            // Bypass the fixture's phase logger so this exercises the real scheduled updates.
            Reflect.deleteProperty(world, 'runBlockUpdates');

            const tick = world.update(1);
            expect(updated).toEqual(['start:0', 'finish:0', 'start:1', 'finish:1']);
            await tick;
        });

        it("reads the tick's sealed change log before it sends the block changes", async () => {
            // Blocks reach clients only through the log, so the flush has to read a sealed tick.
            const { world, calls } = worldTicking();

            await world.update(1);

            expect(calls.indexOf('tickSealed')).toBeGreaterThan(-1);
            expect(calls.indexOf('tickSealed')).toBeLessThan(calls.indexOf('flushBlockChanges'));
        });

        it("sends the tick's occurrences after the seal and ahead of the block changes", async () => {
            // An occurrence made in a unit that throws leaves the log with it, so only a sealed
            // tick says which ones happened. A block's break particles went out the moment the
            // block broke, ahead of the batched block change, and still do.
            const { world, calls } = worldTicking();

            await world.update(1);

            expect(calls.indexOf('tickSealed')).toBeLessThan(calls.indexOf('flushOccurrences'));
            expect(calls.indexOf('flushOccurrences')).toBeLessThan(calls.indexOf('flushBlockChanges'));
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

        it("sends the entities' changes from the sealed tick, before the tracking and the movement", async () => {
            // An entity that entered is shown before anything is said about it, and replication
            // reads the entities only from the log, so the flush comes after the seal.
            const { world, calls } = worldTicking();

            await world.update(1);

            expect(calls.indexOf('tickSealed')).toBeLessThan(calls.indexOf('flushEntities'));
            expect(calls.indexOf('flushEntities')).toBeLessThan(calls.indexOf('reconcile'));
            expect(calls.indexOf('flushEntities')).toBeLessThan(calls.indexOf('flushMovement'));
        });

        it('shows what entered before the occurrences and takes what left away after them', async () => {
            // An event about an entity has to reach a client that has the entity: after its
            // AddActor, and before its RemoveActor, such as a killing blow's hurt flash.
            const { world, calls } = worldTicking();

            await world.update(1);

            expect(calls.indexOf('flushEntities')).toBeLessThan(calls.indexOf('flushOccurrences'));
            expect(calls.indexOf('flushOccurrences')).toBeLessThan(calls.indexOf('flushDepartures'));
            // A visibility pass hides what the replica no longer holds, so it follows the departures.
            expect(calls.indexOf('flushDepartures')).toBeLessThan(calls.indexOf('reconcile'));
        });
    });
});

describe('world portal contacts', () => {
    /** A standing player, 0.6 wide and 1.8 tall, whose feet are at `feet`. */
    const standingAt = (feet: Vector3, onCooldown = false): StoreActor => {
        // A settled client: no world change is waiting on its loading screen.
        const session = stub<PlayerSession>({ pendingDimensionChange: () => undefined });
        const position = new Position(
            feet.getX(),
            feet.getY() + 1.62,
            feet.getZ(),
            stub<World>({ viewerOf: () => session })
        );
        // An entity of the player's type, which is what the portal pass reads of a player.
        return actorOf({
            getType: () => 'minecraft:player',
            getRuntimeId: () => 1n,
            getPosition: () => position,
            getWorld: () => position.getWorld(),
            getFeetY: () => feet.getY(),
            getBox: () => ({ width: 0.6, height: 1.8 }),
            isOnPortalCooldown: () => onCooldown,
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
