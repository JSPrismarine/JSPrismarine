import MessageHeaders from '../MessageHeaders';
import OfflinePacket from '../UnconnectedPacket';

export default class OpenConnectionRequest1 extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageHeaders.OPEN_CONNECTION_REQUEST_1, buffer);
    }

    public mtuSize!: number;
    public protocol!: number;

    public decodePayload(): void {
        this.readMagic();
        this.protocol = this.readByte();
        this.mtuSize = this.getBuffer().byteLength + 28;
    }

    public encodePayload(): void {
        this.writeMagic();
        this.writeByte(this.protocol);
        const length = this.mtuSize - this.getBuffer().byteLength;
        this.write(Buffer.alloc(length));
    }
}
