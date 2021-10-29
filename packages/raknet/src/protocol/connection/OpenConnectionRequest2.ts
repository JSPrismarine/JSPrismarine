import { InetAddress } from '../../RakNet';
import MessageHeaders from '../MessageHeaders';
import OfflinePacket from '../UnconnectedPacket';

export default class OpenConnectionRequest2 extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageHeaders.OPEN_CONNECTION_REQUEST_2, buffer);
    }

    public serverAddress!: InetAddress;
    public mtuSize!: number;
    public clientGUID!: bigint;

    public decodePayload(): void {
        this.readMagic();
        this.serverAddress = this.readAddress();
        this.mtuSize = this.readUnsignedShort();
        this.clientGUID = this.readLong();
    }

    public encodePayload(): void {
        this.writeMagic();
        this.writeAddress(this.serverAddress);
        this.writeUnsignedShort(this.mtuSize);
        this.writeLong(this.clientGUID);
    }
}
