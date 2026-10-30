import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { serverToClientHandshakePacket } from '../wire/definitions/serverToClientHandshake';
import { protocolVersion } from '../wire/versions/v2193';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';

export interface ServerToClientHandshake {
    /**
     * `Handshake WebToken`, a JWT signed with the server's ECDSA P-384 key. Its header carries
     * `x5u`, the server's public key as base64 DER, and its payload carries `salt`, base64.
     */
    jwt: string;
}

/**
 * The definition carries no version gate, so it resolves to the same frozen layout at every
 * protocol; the oldest supported version stands in for the packet class, which does not know
 * its session's protocol.
 */
const layout = () => layoutAt(serverToClientHandshakePacket, protocolVersion);

/**
 * The server's half of the encryption handshake, and the last packet it sends in the clear.
 *
 * The wire layout is the `serverToClientHandshakePacket` definition in `wire/definitions`.
 *
 * The token carries no game state. Both ends run ECDH between their own private key and the
 * other's public key, the server's from `x5u` and the client's from the login chain, then take
 * SHA-256(salt || shared secret) as the AES key. Nothing secret crosses the wire.
 *
 * Since 1.26.51 the client rejects a token over 16 KiB or one that is not a well-formed JWT.
 * An ES384 token with one `x5u` header and one `salt` claim is under one kilobyte.
 *
 * The client answers with an empty `ClientToServerHandshake`, already encrypted. A server
 * that never sends this packet gets no answer and the session stays in plaintext.
 */
export default class ServerToClientHandshakePacket extends NetworkPacket<ServerToClientHandshake> {
    public get id(): number {
        return PacketIdentifier.SERVER_TO_CLIENT_HANDSHAKE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerToClientHandshake): void {
        layout().encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerToClientHandshake {
        return layout().decode(stream);
    }
}
