import { describe, expect, it } from 'vitest';

import { RespawnState } from '../packet/RespawnPacket';
import RespawnHandler from './RespawnHandler';

/**
 * The respawn exchange, and the order its three states go in.
 *
 * `SERVER_SEARCHING_FOR_SPAWN` at the death, `CLIENT_READY_TO_SPAWN` from the client when it
 * has loaded, `SERVER_READY_TO_SPAWN` in answer. The middle one is the only one this handler
 * owns, and the answer to it is what lets go of the client's screen: sent at the wrong moment
 * - or not at all - the player watches "Respawning" for ever.
 */
const fakeSession = () => {
    const done: Array<{ state?: number; what?: string }> = [];

    return {
        done,
        session: {
            sendRespawn: async (_position: unknown, state: number) => void done.push({ state }),
            sendAttributes: async () => void done.push({ what: 'attributes' }),
            sendMetadata: async () => void done.push({ what: 'metadata' }),
            sendAbilities: async () => void done.push({ what: 'abilities' }),
            sendInventory: async () => void done.push({ what: 'inventory' }),
            getPlayer: () => ({ getPosition: () => ({}) })
        } as any
    };
};

describe('RespawnHandler', () => {
    it('answers the client with the state that ends the exchange', async () => {
        // Once a second, for as long as it takes. No answer is a screen that never lifts and
        // a log filling with `RespawnPacket`.
        const { done, session } = fakeSession();

        await new RespawnHandler().handle({ state: RespawnState.CLIENT_READY_TO_SPAWN } as any, {} as any, session);

        expect(done[0]).toEqual({ state: RespawnState.SERVER_READY_TO_SPAWN });
    });

    it('describes the player again once the exchange has closed', async () => {
        // The client rebuilds its local player across the exchange and comes back with the
        // one it had before - a corpse with no health and nothing in its hand. Anything sent
        // while it was still on the death screen was thrown away.
        const { done, session } = fakeSession();

        await new RespawnHandler().handle({ state: RespawnState.CLIENT_READY_TO_SPAWN } as any, {} as any, session);

        expect(done.map((step) => step.what).filter(Boolean)).toEqual([
            'attributes',
            'metadata',
            'abilities',
            'inventory'
        ]);
        // After the answer, never before it.
        expect(done[0]!.state).toBe(RespawnState.SERVER_READY_TO_SPAWN);
    });

    it('ignores the states that are the server\u2019s to send', async () => {
        const { done, session } = fakeSession();

        for (const state of [RespawnState.SERVER_SEARCHING_FOR_SPAWN, RespawnState.SERVER_READY_TO_SPAWN]) {
            await new RespawnHandler().handle({ state } as any, {} as any, session);
        }

        expect(done).toHaveLength(0);
    });
});
