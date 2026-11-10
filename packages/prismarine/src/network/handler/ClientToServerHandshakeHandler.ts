import type ClientToServerHandshakePacket from '@jsprismarine/protocol/packet/ClientToServerHandshakePacket';
import type Server from '../../Server';
import type ClientConnection from '../ClientConnection';
import type ConnectionPacketHandler from './ConnectionPacketHandler';

/**
 * The client's encrypted reply to `ServerToClientHandshake`, which finishes the login.
 *
 * Arriving readable is the whole message: the dispatcher already decrypted the frame and checked
 * its checksum, so a client that derived another key never reaches this handler.
 */
export default class ClientToServerHandshakeHandler implements ConnectionPacketHandler<ClientToServerHandshakePacket> {
    public static PacketName = 'ClientToServerHandshakePacket';
    public readonly phases = ['encryption'] as const;
    // Login I/O stays out of the tick (ADR 0014); the resumed admission still reaches the world.
    public readonly lane = 'connection';

    /** Runs the rest of the login that `LoginHandler` set aside, now that the session is encrypted. */
    public async handle(
        _packet: ClientToServerHandshakePacket,
        _server: Server,
        connection: ClientConnection
    ): Promise<void> {
        const resume = connection.resumeLogin;
        connection.resumeLogin = null;
        connection.phase = 'login';
        await resume?.();
    }
}
