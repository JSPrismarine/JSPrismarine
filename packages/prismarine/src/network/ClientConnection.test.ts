import { describe, expect, it, vi } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type { RakNetSession } from '@jsprismarine/raknet';
import type Player from '../Player';
import { stub } from '../testing/stub.test.helper';
import ClientConnection from './ClientConnection';
import type PlayerSession from './PlayerSession';

describe('network', () => {
    describe('ClientConnection', () => {
        const fakeConnection = () => new ClientConnection(stub<RakNetSession>(), stub<Logger>());

        /**
         * A player whose teardown is `disable`.
         *
         * Set after the fact rather than passed as a literal: `Entity` declares `constructor`
         * as the class itself, which an object literal's `Function` does not satisfy.
         */
        const fakePlayer = (disable: Player['disable']) => {
            const player = stub<Player>();
            player.disable = disable;
            return player;
        };

        /** A session and the player behind it, both recording what was released. */
        const fakePair = () => {
            const released: string[] = [];
            const session = stub<PlayerSession>({
                getPlayer: () => fakePlayer(async () => void released.push('player')),
                disable: () => void released.push('session')
            });

            return { session, released };
        };

        it('takes the session it is given, rather than reaching into the player for one', () => {
            // The session belongs to the connection - it is what the packet dispatcher looks
            // up. It used to be built by the `Player` and merely adopted here, which is what
            // made the two modules import each other at runtime.
            const { session } = fakePair();
            const connection = fakeConnection();

            expect(connection.getPlayerSession()).toBeNull();

            connection.attachPlayerSession(session);

            expect(connection.getPlayerSession()).toBe(session);
        });

        it('refuses to attach a second session to the same connection', () => {
            const { session } = fakePair();
            const connection = fakeConnection();

            connection.attachPlayerSession(session);

            expect(() => connection.attachPlayerSession(session)).toThrow(/already created/);
        });

        it('releases the player and the session together', async () => {
            const { session, released } = fakePair();
            const connection = fakeConnection();

            connection.attachPlayerSession(session);
            await connection.closePlayerSession();

            // Both, and the session last: its place in the chunk rotation outlives the
            // player's own teardown, and leaving it behind is what grew the scheduler's set
            // for the life of the server.
            expect(released).toStrictEqual(['player', 'session']);
            expect(connection.getPlayerSession()).toBeNull();
        });

        it('tears down once, however many times it is asked', async () => {
            // A kick, the client's own disconnect and a failed join all arrive here. Whichever
            // gets here first does the work; the rest find nothing left to do.
            const { session, released } = fakePair();
            const connection = fakeConnection();

            connection.attachPlayerSession(session);
            await connection.closePlayerSession();
            await connection.closePlayerSession();

            expect(released).toStrictEqual(['player', 'session']);
        });

        it('still releases the session when the player fails to shut down', async () => {
            const disable = vi.fn<() => void>();
            const session = stub<PlayerSession>({
                getPlayer: () =>
                    fakePlayer(async () => {
                        throw new Error('world unavailable');
                    }),
                disable
            });

            const connection = fakeConnection();
            connection.attachPlayerSession(session);

            await expect(connection.closePlayerSession()).rejects.toThrow('world unavailable');
            expect(disable).toHaveBeenCalledOnce();
        });

        it('does nothing for a connection that never got a player', async () => {
            const connection = fakeConnection();

            await expect(connection.closePlayerSession()).resolves.toBeUndefined();
            expect(connection.getPlayerSession()).toBeNull();
        });
    });
});
