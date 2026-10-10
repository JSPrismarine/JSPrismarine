import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

export interface ServerToClientHandshake {
    /**
     * A JWT whose `x5u` header is the server's public key and whose `salt` claim is the other
     * half of what the encryption key is derived from.
     */
    jwt: string;
}

/**
 * The server's half of the encryption handshake, and the last packet sent in the clear.
 *
 * It carries no game state: everything in it exists so that both ends can arrive at the same
 * 32 bytes without ever sending them. The client answers with an empty
 * `ClientToServerHandshake` - by which point both directions are already encrypted.
 */
export default class ServerToClientHandshakePacket extends NetworkPacket<ServerToClientHandshake> {
    public get id(): number {
        return PacketIdentifier.SERVER_TO_CLIENT_HANDSHAKE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerToClientHandshake): void {
        stream.writeString(data.jwt);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerToClientHandshake {
        return { jwt: stream.readString() };
    }
}
