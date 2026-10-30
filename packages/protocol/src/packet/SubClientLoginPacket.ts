import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import NetworkBinaryStream from '../NetworkBinaryStream';

/** The two opaque JWT strings carried by a split-screen sub-client login. */
export interface SubClientLogin {
    /** Chain JSON exactly as it arrived; this packet does not verify it. */
    chainData: string;
    /** Client data JWT exactly as it arrived; this packet does not verify it. */
    clientData: string;
}

/**
 * Adds a second, third, or fourth player sharing the device's connection. The main player
 * authenticates through `LoginPacket`; this packet carries the additional player's connection
 * request as an opaque body containing the same chain JSON and client-data JWT strings.
 *
 * Protocol 2193 layout: `Sub Client Connection Request` as a varuint32-length-prefixed buffer.
 * Inside it, each string has a uint32 little-endian byte length followed by ASCII bytes. The
 * authentication contents are preserved without parsing or verification.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/sub-client-login-packet/
 */
export default class SubClientLoginPacket extends NetworkPacket<SubClientLogin> {
    public get id(): number {
        return PacketIdentifier.SUB_CLIENT_LOGIN;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SubClientLogin): void {
        const request = new NetworkBinaryStream();
        request.writeLELengthASCIIString(data.chainData);
        request.writeLELengthASCIIString(data.clientData);
        stream.writeLengthPrefixed(request.getWriteBuffer());
    }

    protected deserializePayload(stream: NetworkBinaryStream): SubClientLogin {
        const request = new NetworkBinaryStream(stream.readLengthPrefixed());
        const chainData = request.readLELengthASCIIString();
        const clientData = request.readLELengthASCIIString();

        if (!request.feof()) {
            const unread = request.readRemaining().byteLength;
            throw new Error(`The sub-client connection request has ${unread} unread bytes after the client data`);
        }

        return { chainData, clientData };
    }
}
