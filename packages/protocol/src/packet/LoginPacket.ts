import NetworkBinaryStream from '../NetworkBinaryStream';
import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

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
 * Wire layout at protocol 2193: `Client Network Version` as a big endian int32, then
 * `Connection Request` as a varuint byte length over the two blobs, each with its own little
 * endian uint32 length. The outer length is redundant with the two inner ones, and servers
 * check it anyway: the reader here takes the request as a sub-buffer of that length, so a
 * request claiming more than it carries fails here rather than consuming the next packet in
 * the batch. JSPrismarine's server reads it the same way and also refuses a request with
 * bytes left after the second blob.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/login-packet/
 */
export default class LoginPacket extends NetworkPacket<Login> {
    public get id(): number {
        return PacketIdentifier.LOGIN;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: Login): void {
        // Not a varint: a server of another version has to be able to read this field in
        // order to refuse the connection for the right reason.
        stream.writeInt(data.protocolVersion);

        const body = new NetworkBinaryStream();
        body.writeLELengthASCIIString(data.chainData);
        body.writeLELengthASCIIString(data.clientData);

        stream.writeLengthPrefixed(body.getBuffer());
    }

    protected deserializePayload(stream: NetworkBinaryStream): Login {
        const protocolVersion = stream.readInt();

        // Read through the declared length rather than past it, so a body claiming more
        // than it carries fails here instead of silently consuming the next packet in the
        // batch.
        const body = new NetworkBinaryStream(stream.readLengthPrefixed());
        const login = {
            protocolVersion,
            chainData: body.readLELengthASCIIString(),
            clientData: body.readLELengthASCIIString()
        };

        if (!body.feof()) {
            const unread = body.readRemaining().byteLength;
            throw new Error(`The connection request has ${unread} unread bytes after the client data`);
        }

        return login;
    }
}
