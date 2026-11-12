import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type Server from '../Server';
import type { Config } from '../config/Config';
import { MERCHANT_FIELD } from '../entity/data/trading';
import { stub } from '../testing/stub.test.helper';
import type { ChangeEntry } from '../world/changelog/ChangeEntry';
import { Dimensions } from '../world/DimensionType';
import type { World } from '../world/World';
import { NetworkWorldReplicator } from './NetworkWorldReplicator';
import type { OpenBlockContainer, OpenTrade, TradingActor } from './PlayerSession';
import type PlayerSession from './PlayerSession';

/**
 * What replication sends a player's own client after the seal: a trader's offers to the players
 * trading with it, and a slot shown again to the player that carries it. Asserted on the count
 * and the order of the sends, never on their timing.
 */

/** A player in the world, trading with `trader` when one is given, recording its own sends. */
const player = (runtimeId: bigint, trader?: bigint) => {
    const offers: number[] = [];
    const slots: string[] = [];
    const open =
        trader === undefined
            ? undefined
            : stub<OpenBlockContainer>({
                  trade: stub<OpenTrade>({ trader: stub<TradingActor>({ getRuntimeId: () => trader }) })
              });
    const session = stub<PlayerSession>({
        runtimeId,
        getOpenBlockContainer: () => open,
        sendTradeOffers: async () => void offers.push(offers.length + 1),
        sendOwnSlot: async (container: string, slot: number) => void slots.push(`${container}:${slot}`)
    });
    return { session, offers, slots };
};

const replicatorOver = (sessions: PlayerSession[]) => {
    const world = stub<World>({
        getName: () => 'test',
        getDimension: () => Dimensions.Overworld,
        getViewers: () => sessions,
        viewerOf: (runtimeId) => sessions.find((session) => session.runtimeId === runtimeId)
    });
    const server = stub<Server>({
        getConfig: () => stub<Config>({ getProximityBroadcast: () => true, getPacketCompressionLevel: () => 1 }),
        getLogger: () => stub<Logger>({ verbose: () => {}, error: () => {} })
    });
    return new NetworkWorldReplicator(world, server);
};

let ticks = 0;
const seal = (replicator: NetworkWorldReplicator, ...entries: ChangeEntry[]): void =>
    replicator.tickSealed({ tick: ++ticks, entries });

const offersOf = (trader: bigint, uses: number): ChangeEntry => ({
    kind: 'field',
    field: 'entity',
    address: { entity: trader, field: MERCHANT_FIELD },
    before: { uses: uses - 1 },
    after: { uses }
});

const slotShown = (entity: bigint, container: string, slot: number): ChangeEntry => ({
    kind: 'occurrence',
    occurrence: 'slot-shown',
    data: { entity, container, slot }
});

describe('NetworkWorldReplicator owner views', () => {
    it("sends a trader's offers once to each player trading with it, however many entries the ticks hold", async () => {
        const trading = [player(1n, 50n), player(2n, 50n)];
        const elsewhere = player(3n, 60n);
        const idle = player(4n);
        const replicator = replicatorOver([...trading, elsewhere, idle].map(({ session }) => session));

        // A trade and the level up it earned, over two ticks read before one flush.
        seal(replicator, offersOf(50n, 1));
        seal(replicator, offersOf(50n, 2), offersOf(50n, 3));
        expect(trading.map(({ offers }) => offers.length)).toEqual([0, 0]);

        await replicator.flushOwnerViews();

        expect(trading.map(({ offers }) => offers.length)).toEqual([1, 1]);
        expect(elsewhere.offers).toHaveLength(0);
        expect(idle.offers).toHaveLength(0);

        // Each change is sent once: a flush with nothing new read sends nothing.
        await replicator.flushOwnerViews();
        expect(trading.map(({ offers }) => offers.length)).toEqual([1, 1]);
    });

    it('sends no offers for a field that is not the offers, or a trader nobody trades with', async () => {
        const trading = player(1n, 50n);
        const replicator = replicatorOver([trading.session]);

        seal(replicator, offersOf(70n, 1), {
            kind: 'field',
            field: 'entity',
            address: { entity: 50n, field: 'health' },
            before: 20,
            after: 19
        });
        await replicator.flushOwnerViews();

        expect(trading.offers).toHaveLength(0);
    });

    it('shows each undone slot to the player that carries it, in log order, and to nobody else', async () => {
        const owner = player(1n);
        const other = player(2n);
        const replicator = replicatorOver([owner.session, other.session]);

        seal(replicator, slotShown(1n, 'inventory', 4), slotShown(1n, 'cursor', 0), slotShown(9n, 'armor', 0));
        expect(owner.slots).toEqual([]);

        await replicator.flushOwnerViews();

        expect(owner.slots).toEqual(['inventory:4', 'cursor:0']);
        expect(other.slots).toEqual([]);
    });
});
