import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { loginPacket } from '../wire/definitions/login';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The client protocol number and the two JWT strings from its login request. */
export interface Login {
    protocolVersion: number;
    /**
     * The chain JSON. Either `{"chain": [...]}` with one JWT per link, or from 1.26.10 the
     * envelope `{"Certificate": "<that JSON>", "AuthenticationType": n, "Token": "<JWT>"}`.
     * Not parsed here.
     */
    chainData: string;
    /** One JWT: skin, device, language, and the address the client dialed. */
    clientData: string;
}

/**
 * Who is connecting, and as what.
 *
 * The two JWT blobs are carried, not interpreted. This packet is a codec, and deciding
 * whether a chain is trustworthy is a policy question that belongs where the policy is.
 * What it does enforce is the framing.
 *
 * Wire layout at protocols 2193 and 2225, which share it: `Client Network Version` as a big endian int32, then
 * `Connection Request` as a varuint byte length over the two blobs, each with its own little
 * endian uint32 length. The layout lives in the declarative definition this class walks
 * (`wire/definitions/login.ts`), which frames the request as one field. The payload here stays
 * flat, so this class lifts the two blobs out of that field and back. A request claiming more
 * bytes than it carries, or leaving bytes after the second blob, fails to decode.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/login-packet/
 */
export default class LoginPacket extends NetworkPacket<Login> {
    public get id(): number {
        return PacketIdentifier.LOGIN;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: Login): void {
        const { protocolVersion, chainData, clientData } = data;
        layoutAt(loginPacket, this.codecProtocol).encode(stream, {
            protocolVersion,
            connectionRequest: { chainData, clientData }
        });
    }

    protected deserializePayload(stream: NetworkBinaryStream): Login {
        const { protocolVersion, connectionRequest } = layoutAt(loginPacket, this.codecProtocol).decode(stream);
        return { protocolVersion, ...connectionRequest };
    }
}
