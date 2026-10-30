import { describe, expect, it, vi } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { DisconnectReason } from '@jsprismarine/minecraft';
import { DisconnectPacket } from '@jsprismarine/protocol';
import type Player from '../Player';
import { stub } from '../testing/stub.test.helper';
import ClientConnection from './ClientConnection';
import type PlayerSession from './PlayerSession';
import type { RakNetTransportConnection } from './transport/RakNetTransport';

describe('network', () => {
    describe('ClientConnection', () => {
        const fakeConnection = () => new ClientConnection(stub<RakNetTransportConnection>(), stub<Logger>());

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

        it('sends the goodbye uncompressed until compression has been negotiated', async () => {
            // A client refused on its first packet has not agreed to compression yet. A
            // deflated disconnect would decode as garbage, so the reason would never show.
            const connection = fakeConnection();
            const send = vi.spyOn(connection, 'sendDataPacket').mockResolvedValue();
            vi.spyOn(connection, 'forceDisconnect').mockImplementation(() => {});

            await connection.disconnect('Outdated client!', false);
            const first = send.mock.calls.at(-1)?.[0];
            expect(first).toBeInstanceOf(DisconnectPacket);
            expect(first?.getPacketData()).toMatchObject({ message: 'Outdated client!' });
            expect(send).toHaveBeenLastCalledWith(first, false);

            connection.hasCompression = true;
            await connection.disconnect('Kicked', false);
            const second = send.mock.calls.at(-1)?.[0];
            expect(second).toBeInstanceOf(DisconnectPacket);
            expect(second?.getPacketData()).toMatchObject({ message: 'Kicked' });
            expect(send).toHaveBeenLastCalledWith(second, true);
        });

        it('stamps the goodbye with the reason code it was given', async () => {
            // The client maps `Reason` to the error code on its disconnect screen. Every
            // server-initiated disconnect used to leave it at `UNKNOWN`.
            const connection = fakeConnection();
            const send = vi.spyOn(connection, 'sendDataPacket').mockResolvedValue();
            vi.spyOn(connection, 'forceDisconnect').mockImplementation(() => {});

            await connection.disconnect();
            const defaultPacket = send.mock.calls.at(-1)?.[0];
            expect(defaultPacket).toBeInstanceOf(DisconnectPacket);
            expect(defaultPacket?.getPacketData()).toMatchObject({ reason: DisconnectReason.DISCONNECTED });
            expect(send).toHaveBeenLastCalledWith(defaultPacket, false);

            await connection.disconnect('Kicked', false, DisconnectReason.KICKED);
            const kickedPacket = send.mock.calls.at(-1)?.[0];
            expect(kickedPacket).toBeInstanceOf(DisconnectPacket);
            expect(kickedPacket?.getPacketData()).toMatchObject({
                reason: DisconnectReason.KICKED,
                message: 'Kicked'
            });
            expect(send).toHaveBeenLastCalledWith(kickedPacket, false);
        });

        it('does nothing for a connection that never got a player', async () => {
            const connection = fakeConnection();

            await expect(connection.closePlayerSession()).resolves.toBeUndefined();
            expect(connection.getPlayerSession()).toBeNull();
        });
    });
});
