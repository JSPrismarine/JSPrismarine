import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
import RespawnPacket, { PlayerRespawnState } from '../packet/RespawnPacket';
import RespawnHandler from './RespawnHandler';

/**
 * The respawn exchange, and the order its three states go in.
 *
 * `SearchingForSpawn` at the death, `ClientReadyToSpawn` from the client when it
 * has loaded, `ReadyToSpawn` in answer. The middle one is the only one this handler
 * owns, and the answer to it is what lets go of the client's screen: sent at the wrong moment
 * - or not at all - the player watches "Respawning" for ever.
 */
const fakeSession = ({ alive = true } = {}) => {
    const done: Array<{ state?: PlayerRespawnState; position?: Vector3; what?: string }> = [];
    const dropped: string[] = [];
    const world = stub<World>({ getSpawnPosition: async () => new Vector3(100, 70, 100) });
    const standingAt = new Position(0, 64, 0, world);

    return {
        done,
        dropped,
        standingAt,
        session: stub<PlayerSession>({
            sendRespawn: async (position, state) => void done.push({ state, position }),
            sendAttributes: async () => void done.push({ what: 'attributes' }),
            sendMetadata: async () => void done.push({ what: 'metadata' }),
            sendAbilities: async () => void done.push({ what: 'abilities' }),
            sendInventory: async () => void done.push({ what: 'inventory' }),
            getPlayer: () =>
                stub<Player>({
                    getName: () => 'tester',
                    getRuntimeId: () => 7n,
                    isAlive: () => alive,
                    getWorld: () => world,
                    getPosition: () => standingAt
                })
        }),
        server: stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message: string[]) => void dropped.push(message.join(' ')) })
        })
    };
};

const respawn = (state: PlayerRespawnState, runtimeEntityId = 7n): RespawnPacket =>
    Object.assign(new RespawnPacket(), { state, runtimeEntityId });

describe('RespawnHandler', () => {
    it('answers the client with the state that ends the exchange', async () => {
        // Once a second, for as long as it takes. No answer is a screen that never lifts and
        // a log filling with `RespawnPacket`.
        const { done, session, server, standingAt } = fakeSession();

        await new RespawnHandler().handle(respawn(PlayerRespawnState.ClientReadyToSpawn), server, session);

        expect(done[0]).toEqual({ state: PlayerRespawnState.ReadyToSpawn, position: standingAt });
    });

    it('names the world spawn while the player is still dead', async () => {
        // The client may report ready before it has pressed the button, in which case nothing
        // has moved the player yet and the corpse's position is not where they come back.
        const { done, session, server } = fakeSession({ alive: false });

        await new RespawnHandler().handle(respawn(PlayerRespawnState.ClientReadyToSpawn), server, session);

        expect(done[0]?.position).toEqual(new Vector3(100, 70, 100));
    });

    it('describes the player again once the exchange has closed', async () => {
        // The client rebuilds its local player across the exchange and comes back with the
        // one it had before - a corpse with no health and nothing in its hand. Anything sent
        // while it was still on the death screen was thrown away.
        const { done, session, server } = fakeSession();

        await new RespawnHandler().handle(respawn(PlayerRespawnState.ClientReadyToSpawn), server, session);

        expect(done.map((step) => step.what).filter(Boolean)).toEqual([
            'attributes',
            'metadata',
            'abilities',
            'inventory'
        ]);
        // After the answer, never before it.
        expect(done[0]!.state).toBe(PlayerRespawnState.ReadyToSpawn);
    });

    it("ignores the states that are the server's to send", async () => {
        const { done, session, server } = fakeSession();

        for (const state of [PlayerRespawnState.SearchingForSpawn, PlayerRespawnState.ReadyToSpawn]) {
            await new RespawnHandler().handle(respawn(state), server, session);
        }

        expect(done).toHaveLength(0);
    });

    it('drops a respawn for another runtime id', async () => {
        const { done, dropped, session, server } = fakeSession();

        await new RespawnHandler().handle(respawn(PlayerRespawnState.ClientReadyToSpawn, 8n), server, session);

        expect(done).toHaveLength(0);
        expect(dropped).toHaveLength(1);
    });
});
