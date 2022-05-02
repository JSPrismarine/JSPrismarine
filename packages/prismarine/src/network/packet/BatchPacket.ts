import BinaryStream from '@jsprismarine/jsbinaryutils';
import DataPacket from './DataPacket';
import Zlib from 'zlib';
import { inflateSync } from 'fflate';

/**
 * @internal
 */
export default class BatchPacket extends DataPacket {
    public static NetID = 0xfe;

    private payload = new BinaryStream();
    // Bigger compression level leads to more CPU usage and less network, and vice versa
    // TODO: batch.setCompressionLevel(), it should be dependent from Server instance
    // private readonly compressionLevel: number = Server?.instance?.getConfig().getPacketCompressionLevel() ?? 7;

    public decodeHeader(): void {
        const pid = this.readByte();
        if (!pid === this.getId()) {
            throw new Error(`Batch ID mismatch: is ${this.getId()}, got ${pid}`);
        }
    }

    public decodePayload(): void {
        try {
            this.payload.write(inflateSync(this.readRemaining()));
        } catch (e) {
            throw new Error(`Failed to inflate batched content (${(<Error>e).message})`);
        }
    }

    public encodeHeader(): void {
        this.writeByte(this.getId());
    }

    public encodePayload(): void {
        // this.append(Buffer.from(Fflate.deflateSync(this.payload, { level: 7 })));
        // Seems like Zlib runs a little bit better for deflating, will see in future with async...
        this.write(Zlib.deflateRawSync(this.payload.getBuffer(), { level: 7 }));
    }

    public addPacket(packet: DataPacket): void {
        if (!packet.getEncoded()) {
            packet.encode();
        }

        this.payload.writeUnsignedVarInt(packet.getBuffer().byteLength);
        this.payload.write(packet.getBuffer());
    }

    public getPackets(): Buffer[] {
        const stream = new BinaryStream(this.payload.getBuffer());
        const packets: Buffer[] = [];
        do {
            // VarUint: packet length
            packets.push(stream.read(stream.readUnsignedVarInt()));
        } while (!stream.feof());
        return packets;
    }
}
