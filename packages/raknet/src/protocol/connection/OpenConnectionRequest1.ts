import MessageHeaders from '../MessageHeaders.js';
import OfflinePacket from '../UnconnectedPacket.js';

export default class OpenConnectionRequest1 extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageHeaders.OPEN_CONNECTION_REQUEST_1, buffer);
    }

    public mtuSize!: number;
    public protocol!: number;

    public decodePayload(): void {
        this.readMagic();
        this.protocol = this.readByte();
        this.mtuSize = this.getBuffer().byteLength;
    }

    public encodePayload(): void {
        this.writeMagic();
        this.writeByte(this.protocol);
        this.write(Buffer.alloc(this.mtuSize - this.getBuffer().byteLength));
    }
}
