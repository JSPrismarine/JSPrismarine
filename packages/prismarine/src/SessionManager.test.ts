import { describe, expect, it } from 'vitest';

import type Player from './Player';
import SessionManager from './SessionManager';
import type ClientConnection from './network/ClientConnection';
import type PlayerSession from './network/PlayerSession';
import { stub } from './testing/stub.test.helper';

/** A connection whose session speaks for an online player with runtime id `id`. */
const connectionFor = (id: bigint) => {
    const player = stub<Player>({ getRuntimeId: () => id, isOnline: () => true });
    const session = stub<PlayerSession>({ getPlayer: () => player });
    const connection = stub<ClientConnection>({ getPlayerSession: () => session });

    return { connection, player };
};

describe('SessionManager', () => {
    describe('getPlayerById', () => {
        it('finds the online player with that runtime id', () => {
            const manager = new SessionManager();
            const { connection, player } = connectionFor(7n);
            manager.add('token', connection);

            expect(manager.getPlayerById(7n)).toBe(player);
        });

        it('returns null for an id nobody has, rather than throwing', () => {
            // It asserted, so asking after a player who had just left took the caller down.
            const manager = new SessionManager();
            manager.add('token', connectionFor(7n).connection);

            expect(manager.getPlayerById(8n)).toBeNull();
        });
    });
});
