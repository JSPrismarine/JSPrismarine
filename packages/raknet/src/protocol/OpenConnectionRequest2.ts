import Identifiers from './Identifiers';
import InetAddress from '../utils/InetAddress';
import OfflinePacket from './OfflinePacket';
import { RemoteInfo } from 'dgram';

export default class OpenConnectionRequest2 extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(Identifiers.OpenConnectionRequest2, buffer);
    }

    public serverAddress!: InetAddress;
    public mtuSize!: number;
    public clientGUID!: bigint;

    public decodePayload(): void {
        this.readMagic();
        this.serverAddress = this.readAddress();
        this.mtuSize = this.readShort();
        this.clientGUID = this.readLong();
    }

    public encodePayload(): void {
        this.writeMagic();
        this.writeAddress(this.serverAddress);
        this.writeShort(this.mtuSize);
        this.writeLong(this.clientGUID);
    }
}
