import { describe, expect, it } from 'vitest';

import type { SessionPlayer } from './network/sessionPlayers';
import SessionManager from './SessionManager';
import type ClientConnection from './network/ClientConnection';
import type PlayerSession from './network/PlayerSession';
import type { PlayerIdentity } from './playerIdentity';
import { identityNamed } from './testing/sessionIdentity.test.helper';
import { stub } from './testing/stub.test.helper';

/** Who a test's player logged in as, unless it names someone else. */
const ALEX = identityNamed('Alex');

/** A connection whose session holds runtime id `id` and `identity`, for a player online or not. */
const connectionFor = (id: bigint, identity = ALEX, online = true) => {
    const player = stub<SessionPlayer>({});
    const session = stub<PlayerSession>({
        runtimeId: id,
        identity,
        isConnected: () => online,
        getPlayer: () => player
    });
    const connection = stub<ClientConnection>({ getPlayerSession: () => session });

    return { connection, player, session };
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

        it('finds the session by the id it holds, and nobody who is not online', () => {
            const manager = new SessionManager();
            const online = connectionFor(7n);
            manager.add(1, online.connection);
            manager.add(2, connectionFor(8n, ALEX, false).connection);

            expect(manager.sessionOf(7n)).toBe(online.session);
            expect(manager.sessionOf(8n)).toBeNull();
            expect(manager.getPlayerById(8n)).toBeNull();
        });
    });

    describe('findPlayer', () => {
        it("matches the name or XUID its session's identity holds", () => {
            const manager = new SessionManager();
            const alex = connectionFor(7n);
            const steve = connectionFor(8n, { ...identityNamed('Steve', 'b'), xuid: '2535400000000001' });
            manager.add(1, alex.connection);
            manager.add(2, steve.connection);

            expect(manager.findPlayer({ name: 'Alex' })).toBe(alex.player);
            expect(manager.findPlayer({ xuid: '2535400000000001' })).toBe(steve.player);
            expect(manager.getPlayerByExactName('Steve')).toBe(steve.player);
            expect(manager.findSession({ name: 'Steve' })).toBe(steve.session);
        });

        it('matches nobody by an empty XUID', () => {
            // A player with no XUID holds an empty one, which names no account.
            const manager = new SessionManager();
            manager.add(1, connectionFor(7n).connection);

            expect(manager.findPlayer({ xuid: '' })).toBeNull();
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

        it('replaces a player whose saved record key another login would share', () => {
            const manager = new SessionManager();
            const joined = joinedAs(steve);
            const login = stub<ClientConnection>({ getPlayerSession: () => null });
            manager.add(1, joined);
            manager.add(2, login);

            // An offline login named after Steve's XUID, with none of its own, files its record
            // under Steve's key.
            expect(manager.claimIdentity(login, { name: steve.xuid, xuid: '', uuid: 'b' }, Promise.resolve())).toEqual([
                { connection: joined, joined: null }
            ]);
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
