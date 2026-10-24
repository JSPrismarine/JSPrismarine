import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

/** Nothing. The packet arriving at all is the whole message. */
export type ClientToServerHandshake = Record<string, never>;

/**
 * The client's answer to `ServerToClientHandshake`: nothing after the packet header, sent
 * encrypted.
 *
 * It says only that the client derived the key and turned encryption on. The server learns
 * that by decrypting the batch and checking its checksum, so the packet carries its meaning
 * by arriving readable rather than by its contents. A client sends it only after receiving
 * `ServerToClientHandshake`, so a server that skipped the handshake must not wait for it.
 */
export default class ClientToServerHandshakePacket extends NetworkPacket<ClientToServerHandshake> {
    public get id(): number {
        return PacketIdentifier.CLIENT_TO_SERVER_HANDSHAKE;
    }

    protected serializePayload(): void {
        // Deliberately empty.
    }

    protected deserializePayload(): ClientToServerHandshake {
        return {};
    }
}
