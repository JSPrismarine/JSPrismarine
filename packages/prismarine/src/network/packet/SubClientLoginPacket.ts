import BinaryStream from '@jsprismarine/binaryutils';
import { NetworkUtil } from '../NetworkUtil';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * The login of a second, third or fourth player sharing one connection in split screen.
 *
 * The main client logs in with a `LoginPacket` first; each extra player on the same device
 * then sends one of these. The sub-client ids in the packet header say which player it is.
 *
 * Wire order at protocol 2193: `Sub Client Connection Request` as a varuint32 byte length
 * followed by that many bytes. Inside are the same two strings `LoginPacket` carries, each a
 * uint32 LE length and then ASCII: the chain JSON, then the client data JWT.
 *
 * Decoding keeps both strings as they arrived and reads no claims out of them. The chain is
 * not verified here, and this server has nothing to attach a second player to, so there is no
 * identity to build. `LoginPacket` owns the chain reading for the one login that does.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/sub-client-login-packet/
 */
export default class SubClientLoginPacket extends FieldNetworkPacket {
    /** The chain JSON exactly as it arrived, unparsed and unverified. */
    public chainData = '';

    /** The client data JWT exactly as it arrived, unparsed and unverified. */
    public clientData = '';

    /**
     * Reads the connection request and the two strings inside it.
     * @throws when the request holds bytes beyond those two strings.
     */
    public decodePayload(): void {
        const request = new BinaryStream(this.read(this.readUnsignedVarInt()));
        this.chainData = NetworkUtil.readLELengthASCIIString(request);
        this.clientData = NetworkUtil.readLELengthASCIIString(request);

        if (!request.feof()) {
            const unread = request.readRemaining().byteLength;
            throw new Error(`The sub-client connection request has ${unread} unread bytes after the client data`);
        }
    }

    /** Writes the two strings back inside a length-prefixed connection request. */
    public encodePayload(): void {
        const request = new BinaryStream();
        NetworkUtil.writeLELengthASCIIString(request, this.chainData);
        NetworkUtil.writeLELengthASCIIString(request, this.clientData);

        const body = request.getWriteBuffer();
        this.writeUnsignedVarInt(body.byteLength);
        this.write(body);
    }
}
