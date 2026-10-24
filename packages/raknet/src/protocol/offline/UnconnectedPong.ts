import { MessageIdentifiers } from '../MessageIdentifiers';
import OfflinePacket from '../OfflinePacket';

/**
 * The answer to an `UnconnectedPing`, which is what fills a server list entry.
 *
 * Wire layout: id, the ping's `timestamp` (uint64), `serverGuid` (uint64), the offline
 * magic, then `serverName` as a RakNet string. Both 64 bit fields are unsigned: RakNet's
 * `RakNetGUID` and `RakNet::Time` are, and a Bedrock Dedicated Server prints the same guid
 * unsigned in the MOTD line, so reading it signed made the two disagree for half of all guids.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L4650
 */
export default class UnconnectedPong extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.UNCONNECTED_PONG, buffer);
    }

    public timestamp!: bigint;
    public serverGuid!: bigint;
    public serverName!: string;

    public decodePayload(): void {
        this.timestamp = this.readUnsignedLong();
        this.serverGuid = this.readUnsignedLong();
        this.readMagic();
        this.serverName = this.readString();
    }

    public encodePayload(): void {
        this.writeUnsignedLong(this.timestamp);
        this.writeUnsignedLong(this.serverGuid);
        this.writeMagic();
        this.writeString(this.serverName);
    }
}
