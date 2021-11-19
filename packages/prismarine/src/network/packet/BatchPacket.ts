import { deflate, inflate, inflateSync } from 'fflate';

import BinaryStream from '@jsprismarine/jsbinaryutils';
import DataPacket from './DataPacket';
import Zlib from 'zlib';
import util from 'util';

const asyncInflate = util.promisify(inflate);
type level = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const DEFAULT_COMPRESSION_LEVEL = 7;

/**
 * @internal
 */
export default class BatchPacket extends DataPacket {
    public static NetID = 0xfe;

    private readonly payload = new BinaryStream();
    // Bigger compression level leads to more CPU usage and less network, and vice versa
    private compressionLevel!: Required<level>;

    public async decodeAsync(): Promise<void> {
        this.decodeHeader();
        await this.decodePayloadAsync();
    }

    public decodeHeader(): void {
        const pid = this.readByte();
        if (!pid === this.getId()) {
            throw new Error(`Batch ID mismatch: is ${this.getId()}, got ${pid}`);
        }
    }

    public decodePayload(): void {
        try {
            this.payload.write(inflateSync(this.readRemaining()));
        } catch {
            this.payload.write(new Uint8Array(0));
        }
    }

    public async decodePayloadAsync(): Promise<void> {
        this.payload.write(await asyncInflate(this.readRemaining()));
    }

    public async encodeAsync(): Promise<void> {
        this.encodeHeader();
        await this.encodePayloadAsync();
    }

    public encodeHeader(): void {
        this.writeByte(this.getId());
    }

    public encodePayload(): void {
        this.write(Zlib.deflateRawSync(this.payload.getBuffer(), { level: this.compressionLevel }));
    }

    public async encodePayloadAsync(): Promise<void> {
        this.write(
            await new Promise((resolve, reject) => {
                Zlib.deflateRaw(this.payload.getBuffer(), { level: this.compressionLevel }, (err, data) => {
                    if (err) reject(err);
                    resolve(data);
                });
            })
        );
    }

    public setCompressionLevel(level?: level): void {
        this.compressionLevel = level ?? DEFAULT_COMPRESSION_LEVEL;
    }

    public addPacket(packet: DataPacket): void {
        if (!packet.getEncoded()) {
            packet.encode();
        }

        this.payload.writeUnsignedVarInt(packet.getBuffer().byteLength);
        this.payload.write(packet.getBuffer());
    }

    public async getPackets(): Promise<Buffer[]> {
        return new Promise((resolve) => {
            const stream = new BinaryStream(this.payload.getBuffer());
            const packets: Buffer[] = [];
            do {
                // Psuhes the packet content on the array of buffers.
                packets.push(stream.read(stream.readUnsignedVarInt()));
            } while (!stream.feof());
            resolve(packets);
        });
    }
}
