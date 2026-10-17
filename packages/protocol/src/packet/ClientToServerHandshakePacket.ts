import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

/** Nothing. The packet arriving at all is the whole message. */
export type ClientToServerHandshake = Record<string, never>;

/**
 * The client's answer to `ServerToClientHandshake`: an empty payload, sent encrypted.
 *
 * It says only that the client derived the key and turned encryption on. The server verifies
 * that by decrypting this and checking its checksum, so an empty packet that arrives readable
 * carries more than one with fields in it would.
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
