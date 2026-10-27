import { describe, expect, it } from 'vitest';

import { Dimensions } from './Dimension';
import EntityGrid from './EntityGrid';
import type { WorldChangeSink } from './WorldChangeSink';
import { World } from './World';
import { inertEntityRuntime } from '../testing/entityServer';

/**
 * The order a tick reports what happened in it.
 *
 * Not decoration: an entity that came into range this tick has to be spawned before the first
 * packet that says it moved, or the client is told a runtime id it was never given and throws
 * the movement away. The phases used to be inlined in `World.update` as direct reach-through
 * into every player's session; now they go out through {@link WorldChangeSink}, and this is
 * what stops the move from having quietly reordered them.
 */
const worldTicking = ({ trackingInterval = 1, currentTick = 19 } = {}) => {
    const calls: string[] = [];

    const record =
        (name: string) =>
        async (...args: unknown[]) => {
            calls.push(name);
            void args;
        };

    const sink: WorldChangeSink = {
        blockChanged: () => calls.push('blockChanged'),
        blockEntityChanged: () => calls.push('blockEntityChanged'),
        blockSound: () => calls.push('blockSound'),
        namedSound: () => calls.push('namedSound'),
        namedParticle: () => calls.push('namedParticle'),
        actorSound: () => calls.push('actorSound'),
        worldEffect: () => calls.push('worldEffect'),
        entityMoved: () => calls.push('entityMoved'),
        entityAttributesChanged: record('entityAttributesChanged'),
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

    // Built on the real prototype, so `update` is the code under test rather than more of the
    // stand-in. Only what would reach the disk, a chunk or the network is replaced.
    const world: World = Object.assign(Object.create(World.prototype), {
        entities: new Map(),
        players: new Map(),
        chunks: new Map(),
        // The real one: it is ordinary in-memory bookkeeping, and a tick rebuilds it. Only what
        // would reach the disk, a chunk or the network is stood in for.
        entityGrid: new EntityGrid(),
        // One short of the second the time is put on the wire, so that the phase runs at all:
        // it is sent once a second rather than every tick.
        currentTick,
        dimension: Dimensions.Overworld,
        // Chunk unloading is outside the phase ordering this fixture exercises.
        provider: { supportsChunkUnload: false },
        // The weather cycle reads `doWeatherCycle` and reports a change through the sink. It
        // reports nothing here, because a clear sky stays clear and the client's default is
        // clear; the rule is what it needs to run at all.
        gameRuleManager: { getGameRule: () => [true, true] as const },
        getEntities: () => [],
        getPlayers: () => [],
        runBlockUpdates: async () => void calls.push('blockUpdates'),
        systems: { tick: () => void calls.push('systems') },
        save: async () => {},
        server: {
            getConfig: () => ({ getEntityTrackingInterval: () => trackingInterval }),
            getLogger: () => ({ verbose: () => {}, error: () => {}, warn: () => {} }),
            // Inert: this file is about the order of the phases, not about what a mob does
            // inside one, and the data runtime's own tick is covered by `live.test.ts`.
            getEntityRuntime: () => inertEntityRuntime()
        }
    });

    world.attachChangeSink(sink);

    return { world, calls };
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
    });
});
