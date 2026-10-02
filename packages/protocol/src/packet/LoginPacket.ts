import NetworkBinaryStream from '../NetworkBinaryStream';
import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

export interface Login {
    protocolVersion: number;
    /** `{"chain": [...]}`, one JWT per link, as JSON. Not parsed here. */
    chainData: string;
    /** One JWT: skin, device, language, and the address the client dialled. */
    clientData: string;
}

/**
 * Who is connecting, and as what.
 *
 * The two JWT blobs are carried, not interpreted: this packet is a codec, and deciding
 * whether a chain is *trustworthy* is a policy question that belongs where the policy is.
 * What it does enforce is the framing - and the framing has a quirk worth naming, because
 * it is the reason this was write-only for so long.
 *
 * After the protocol version comes a varint holding the byte length of everything that
 * follows, and then the two blobs, each with its own little endian 32 bit length. The outer
 * length is redundant with the two inner ones and JSPrismarine's server ignores it, so a
 * packet with a wrong one still logs in here. A real server checks it, which is precisely
 * the sort of thing that only shows up when you finally point the client at one.
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

        return {
            protocolVersion,
            chainData: body.readLELengthASCIIString(),
            clientData: body.readLELengthASCIIString()
        };
    }
}
