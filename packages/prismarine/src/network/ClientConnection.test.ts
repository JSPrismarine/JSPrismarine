import { describe, expect, it, vi } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { DisconnectReason } from '@jsprismarine/minecraft';
import { DisconnectPacket } from '@jsprismarine/protocol';
import { stub } from '../testing/stub.test.helper';
import ClientConnection from './ClientConnection';
import type PlayerSession from './PlayerSession';
import { InetAddress } from '@jsprismarine/raknet';
import type { TransportConnection } from './transport/Transport';

describe('network', () => {
    describe('ClientConnection', () => {
        const fakeConnection = () =>
            new ClientConnection(stub<TransportConnection>(), stub<Logger>({ isEnabled: () => false }));

        /** A session that records each time it is asked to leave. */
        const fakePair = () => {
            const released: string[] = [];
            const session = stub<PlayerSession>({ leave: async () => void released.push('session') });

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

        it('has the session take the player and itself down', async () => {
            const { session, released } = fakePair();
            const connection = fakeConnection();

            connection.attachPlayerSession(session);
            await connection.closePlayerSession();

            expect(released).toStrictEqual(['session']);
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

            expect(released).toStrictEqual(['session']);
        });

        it('lets go of the session when its leave fails', async () => {
            const session = stub<PlayerSession>({
                leave: async () => {
                    throw new Error('world unavailable');
                }
            });

            const connection = fakeConnection();
            connection.attachPlayerSession(session);

            await expect(connection.closePlayerSession()).rejects.toThrow('world unavailable');
            expect(connection.getPlayerSession()).toBeNull();
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
            expect(send).toHaveBeenLastCalledWith(first, false, true);

            connection.hasCompression = true;
            await connection.disconnect('Kicked', false);
            const second = send.mock.calls.at(-1)?.[0];
            expect(second).toBeInstanceOf(DisconnectPacket);
            expect(second?.getPacketData()).toMatchObject({ message: 'Kicked' });
            expect(send).toHaveBeenLastCalledWith(second, true, true);
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
            expect(send).toHaveBeenLastCalledWith(defaultPacket, false, true);

            await connection.disconnect('Kicked', false, DisconnectReason.KICKED);
            const kickedPacket = send.mock.calls.at(-1)?.[0];
            expect(kickedPacket).toBeInstanceOf(DisconnectPacket);
            expect(kickedPacket?.getPacketData()).toMatchObject({
                reason: DisconnectReason.KICKED,
                message: 'Kicked'
            });
            expect(send).toHaveBeenLastCalledWith(kickedPacket, false, true);
        });

        it("reads the client's ID and address from whichever transport carried it", () => {
            const address = new InetAddress('192.0.2.7', 50000);
            const connection = new ClientConnection(
                stub<TransportConnection>({ id: 4, address }),
                stub<Logger>({ isEnabled: () => false })
            );

            expect(connection.getConnectionId()).toBe(4);
            expect(connection.getAddress()).toBe(address);
            // The deprecated accessor only has a session to give for a RakNet client.
            expect(() => connection.getRakNetSession()).toThrow('Connection 4 did not connect over RakNet');
        });

        it('does nothing for a connection that never got a player', async () => {
            const connection = fakeConnection();

            await expect(connection.closePlayerSession()).resolves.toBeUndefined();
            expect(connection.getPlayerSession()).toBeNull();
        });
    });
});
