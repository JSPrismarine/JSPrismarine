import { MessageIdentifiers } from '../MessageIdentifiers';
import OfflinePacket from '../OfflinePacket';

/** The guid RakNet reports for a peer that did not send one. */
const UNASSIGNED_RAKNET_GUID = 0n;

/**
 * Asks a server for its MOTD without connecting.
 *
 * Wire layout: id, `timestamp` (uint64), the offline magic, then `clientGUID` (uint64).
 * RakNet answers a ping that stops after the magic, reading the guid as unassigned, so
 * decoding tolerates the short form; encoding always writes the guid, as the Bedrock
 * client does.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L4641
 */
export default class UnconnectedPing extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.UNCONNECTED_PING, buffer);
    }

    public timestamp!: bigint;
    public clientGUID: bigint = UNASSIGNED_RAKNET_GUID;

    public decodePayload(): void {
        this.timestamp = this.readUnsignedLong();
        this.readMagic();
        this.clientGUID =
            this.getBuffer().byteLength - this.getReadIndex() >= 8 ? this.readUnsignedLong() : UNASSIGNED_RAKNET_GUID;
    }

    public encodePayload(): void {
        this.writeUnsignedLong(this.timestamp);
        this.writeMagic();
        this.writeUnsignedLong(this.clientGUID);
    }
}
