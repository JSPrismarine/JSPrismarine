import BinaryStream from '@jsprismarine/jsbinaryutils';
import DataPacket from './DataPacket';
import Server from '../../Server';
import Zlib from 'zlib';

export default class BatchPacket extends DataPacket {
    public static NetID = 0xfe;

    private payload = Buffer.alloc(0);
    // Bigger compression level leads to more CPU usage and less network, and vice versa
    private readonly compressionLevel: number = Server.instance.getConfig().getPacketCompressionLevel();

    public decodeHeader(): void {
        const pid = this.readByte();
        if (!pid === this.getId()) {
            throw new Error(`Batch ID mismatch: is ${this.getId()}, got ${pid}`);
        }
    }

    public decodePayload(): void {
        try {
            this.payload = Zlib.inflateRawSync(this.readRemaining(), {
                chunkSize: 1024 * 1024 * 2
            });
        } catch {
            this.payload = Buffer.alloc(0);
        }
    }

    public encodeHeader(): void {
        this.writeByte(this.getId());
    }

    public encodePayload(): void {
        this.append(Zlib.deflateRawSync(this.payload, { level: this.compressionLevel }));
    }

    public addPacket(packet: DataPacket): void {
        if (!packet.getEncoded()) {
            packet.encode();
        }

        const stream = new BinaryStream();
        stream.writeUnsignedVarInt(packet.getBuffer().byteLength);
        stream.append(packet.getBuffer());
        this.payload = Buffer.concat([this.payload, stream.getBuffer()]);
    }

    public getPackets(): Buffer[] {
        const stream = new BinaryStream();
        (stream as any).buffer = this.payload;
        const packets: Buffer[] = [];
        while (!stream.feof()) {
            const length = stream.readUnsignedVarInt();
            const buffer = stream.read(length);
            packets.push(buffer);
        }

        return packets;
    }
}
