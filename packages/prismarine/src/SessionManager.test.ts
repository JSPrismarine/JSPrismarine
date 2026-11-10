import { describe, expect, it } from 'vitest';

import type Player from './Player';
import SessionManager from './SessionManager';
import type ClientConnection from './network/ClientConnection';
import type PlayerSession from './network/PlayerSession';
import type { PlayerIdentity } from './playerIdentity';
import { stub } from './testing/stub.test.helper';

/** A connection whose session speaks for an online player with runtime id `id`. */
const connectionFor = (id: bigint) => {
    const player = stub<Player>({ getRuntimeId: () => id, isOnline: () => true });
    const session = stub<PlayerSession>({ getPlayer: () => player });
    const connection = stub<ClientConnection>({ getPlayerSession: () => session });

    return { connection, player };
};

/** A connection whose session holds `identity`, with no login reservation. */
const joinedAs = (identity: PlayerIdentity) =>
    stub<ClientConnection>({ getPlayerSession: () => stub<PlayerSession>({ identity }) });

describe('SessionManager', () => {
    describe('getPlayerById', () => {
        it('finds the online player with that runtime id', () => {
            const manager = new SessionManager();
            const { connection, player } = connectionFor(7n);
            manager.add(1, connection);

            expect(manager.getPlayerById(7n)).toBe(player);
        });

        it('returns null for an id nobody has, rather than throwing', () => {
            // It asserted, so asking after a player who had just left took the caller down.
            const manager = new SessionManager();
            manager.add(1, connectionFor(7n).connection);

            expect(manager.getPlayerById(8n)).toBeNull();
        });
    });

    describe('claimIdentity', () => {
        const steve: PlayerIdentity = { name: 'Steve', xuid: '2535400000000001', uuid: 'a' };

        it('replaces a joined player of the same account by the identity its session holds', () => {
            const manager = new SessionManager();
            const joined = joinedAs({ ...steve, uuid: 'b' });
            const stranger = joinedAs({ name: 'Alex', xuid: '2535400000000002', uuid: 'c' });
            const login = stub<ClientConnection>({ getPlayerSession: () => null });
            manager.add(1, joined);
            manager.add(2, stranger);
            manager.add(3, login);

            const replaced = manager.claimIdentity(login, steve, Promise.resolve());

            expect(replaced).toEqual([{ connection: joined, joined: null }]);
        });

        it('replaces nobody for a connection that has no session yet', () => {
            const manager = new SessionManager();
            const other = stub<ClientConnection>({ getPlayerSession: () => null });
            const login = stub<ClientConnection>({ getPlayerSession: () => null });
            manager.add(1, other);
            manager.add(2, login);

            expect(manager.claimIdentity(login, steve, Promise.resolve())).toEqual([]);
        });
    });
});
