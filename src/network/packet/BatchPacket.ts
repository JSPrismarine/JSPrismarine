import BinaryStream from '@jsprismarine/jsbinaryutils';
import DataPacket from './DataPacket';
import zlib from 'zlib';
import PacketBinaryStream from '../PacketBinaryStream';

export default class BatchPacket extends DataPacket {
    static NetID = 0xfe;

    private payload = Buffer.alloc(0);
    private compressionLevel: number | undefined;

    private allowBatching = false;
    private allowBeforeLogin = true;

    public decodeHeader() {
        let pid = this.readByte();
        if (!pid === this.getId()) {
            throw new Error(
                `Batch ID mismatch: is ${this.getId()}, got ${pid}`
            );
        }
    }

    public decodePayload() {
        let data = this.readRemaining();
        try {
            this.payload = zlib.inflateRawSync(data, {
                chunkSize: 1024 * 1024 * 2
            });
        } catch (e) {
            this.payload = Buffer.alloc(0);
        }
    }

    public encodeHeader() {
        this.writeByte(this.getId());
    }

    public encodePayload() {
        this.append(
            zlib.deflateRawSync(this.payload, { level: this.compressionLevel })
        );
    }

    public addPacket(packet: DataPacket) {
        // if (!packet.allowBatching) {
        //    throw new Error(`${packet.getName()} can't be batched`)
        // }

        if (!packet.getEncoded()) {
            packet.encode();
        }

        let stream = new BinaryStream();
        stream.writeUnsignedVarInt(packet.getBuffer().length);
        stream.append(packet.getBuffer());
        this.payload = Buffer.concat([this.payload, stream.getBuffer()]);
    }

    public getPackets() {
        let stream = new PacketBinaryStream();
        (stream as any).buffer = this.payload;
        let packets = [];
        while (!stream.feof()) {
            const length = stream.readUnsignedVarInt();
            const buffer = stream.read(length);
            packets.push(buffer);
        }
        return packets;
    }
}
