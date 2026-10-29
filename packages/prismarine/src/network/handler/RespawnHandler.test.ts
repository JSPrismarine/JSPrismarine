import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import RespawnPacket from '../packet/RespawnPacket';
import RespawnHandler from './RespawnHandler';

/**
 * The respawn exchange, and the order its three states go in.
 *
 * `SearchingForSpawn` at the death, `ClientReadyToSpawn` from the client when the respawn
 * button is pressed, `SearchingForSpawn` and `ReadyToSpawn` in answer. The middle one is the
 * only one this handler owns, and the answer to it is what lets go of the client: answered
 * wrongly, the player cannot move.
 */
const fakeSession = ({ alive = true } = {}) => {
    const done: Array<{ state?: PlayerRespawnState; position?: Vector3; what?: string }> = [];
    const dropped: string[] = [];
    const world = stub<World>({});
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
                    getPosition: () => standingAt,
                    getRespawnPoint: async () => ({
                        announced: new Vector3(100.5, 71.62, 100.5),
                        block: new Vector3(100, 70, 100),
                        eyes: new Vector3(100, 71.62, 100)
                    })
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

        await new RespawnHandler().handle(respawn(PlayerRespawnState.CLIENT_READY_TO_SPAWN), server, session);

        expect(done[0]).toEqual({ state: PlayerRespawnState.READY_TO_SPAWN, position: standingAt });
    });

    it('answers a dead player as a Bedrock server does: searching at the spawn block, then ready at its eyes', async () => {
        // The client reports ready when the button is pressed, before its respawn action, so
        // the player is still dead here. A Bedrock Dedicated Server 1.26.52 sends these two
        // and nothing else; describing the dead player after them left the client frozen.
        const { done, session, server } = fakeSession({ alive: false });

        await new RespawnHandler().handle(respawn(PlayerRespawnState.CLIENT_READY_TO_SPAWN), server, session);

        expect(done).toEqual([
            { state: PlayerRespawnState.SEARCHING_FOR_SPAWN, position: new Vector3(100, 70, 100) },
            { state: PlayerRespawnState.READY_TO_SPAWN, position: new Vector3(100, 71.62, 100) }
        ]);
    });

    it('describes a player who has already respawned again once the exchange has closed', async () => {
        // The respawn action came first, which a Bedrock server was not recorded doing: the
        // player is alive, and is described again after the answer, as before.
        const { done, session, server } = fakeSession();

        await new RespawnHandler().handle(respawn(PlayerRespawnState.CLIENT_READY_TO_SPAWN), server, session);

        expect(done.map((step) => step.what).filter(Boolean)).toEqual([
            'attributes',
            'metadata',
            'abilities',
            'inventory'
        ]);
        // After the answer, never before it.
        expect(done[0]!.state).toBe(PlayerRespawnState.READY_TO_SPAWN);
    });

    it("ignores the states that are the server's to send", async () => {
        const { done, session, server } = fakeSession();

        for (const state of [PlayerRespawnState.SEARCHING_FOR_SPAWN, PlayerRespawnState.READY_TO_SPAWN]) {
            await new RespawnHandler().handle(respawn(state), server, session);
        }

        expect(done).toHaveLength(0);
    });

    it('drops a respawn for another runtime id', async () => {
        const { done, dropped, session, server } = fakeSession();

        await new RespawnHandler().handle(respawn(PlayerRespawnState.CLIENT_READY_TO_SPAWN, 8n), server, session);

        expect(done).toHaveLength(0);
        expect(dropped).toHaveLength(1);
    });
});
