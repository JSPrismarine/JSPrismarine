import Identifiers from './Identifiers';
import OfflinePacket from './OfflinePacket';

export default class OpenConnectionRequest1 extends OfflinePacket {
    public constructor(buffer: Buffer) {
        super(Identifiers.OpenConnectionRequest1, buffer);
    }

    public mtuSize!: number;
    public protocol!: number;

    public decodePayload(): void {
        this.mtuSize = Buffer.byteLength(this.getBuffer()) + 1 + 28;
        this.readMagic();
        this.protocol = this.readByte();
    }

    public encodePayload(): void {
        this.writeMagic();
        this.writeByte(this.protocol);
        let length = this.mtuSize - this.getBuffer().byteLength;
        let buf = Buffer.alloc(length).fill(0x00);
        this.append(buf);
    }
}
