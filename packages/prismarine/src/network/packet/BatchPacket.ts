import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import BinaryStream from '@jsprismarine/binaryutils';
import Zlib from 'zlib';
import { CompressionProvider } from '../CompressionProvider.js';
import DataPacket from './DataPacket';

/**
 * @internal
 */
/** What the server compressed at before the level was configurable. */
export const DEFAULT_COMPRESSION_LEVEL = 7;

export default class BatchPacket extends DataPacket {
    public static NetID = 0xfe;

    public compressed = true; //  TODO: better solution
    private payload = new BinaryStream();

    /**
     * Higher means less bandwidth and more CPU. Measured on a 10 KiB chunk payload: level 7
     * costs 0.367 ms, level 1 costs 0.111 ms - so this is the dial between the two, and the
     * default keeps the bandwidth this server has always used.
     */
    public compressionLevel = DEFAULT_COMPRESSION_LEVEL;

    public decodeHeader(): void {
        const pid = this.readByte();
        if (pid !== this.getId()) {
            throw new Error(`Batch ID mismatch: is ${this.getId()}, got ${pid}`);
        }
    }

    public decodePayload(): void {
        this.payload.write(
            this.compressed
                ? CompressionProvider.fromAlgorithmSync(CompressionProvider.fromBatchPrefix(this.readByte()))(
                      this.readRemaining()
                  )
                : this.readRemaining()
        );
    }

    public async asyncDecode(): Promise<Buffer[]> {
        this.decodeHeader();

        try {
            this.payload.write(
                this.compressed
                    ? await CompressionProvider.fromAlgorithm(CompressionProvider.fromBatchPrefix(this.readByte()))(
                          this.readRemaining()
                      )
                    : this.readRemaining()
            );
        } catch (error: unknown) {
            throw new Error(`Failed to inflate batched content`, { cause: error });
        }

        return this.getPackets();
    }

    public encodeHeader(): void {
        this.writeByte(this.getId());
    }

    public encodePayload(): void {
        if (this.compressed) {
            this.writeByte(PacketCompressionAlgorithm.ZLIB);
        }
        this.write(
            this.compressed
                ? Zlib.deflateRawSync(this.payload.getBuffer(), { level: this.compressionLevel })
                : this.payload.getBuffer()
        );
    }

    /**
     * The same as {@link encode}, with the compression handed to zlib's asynchronous API.
     *
     * Node runs that on the libuv thread pool, so the work genuinely leaves the main thread
     * rather than merely being deferred on it. Worth it for chunks, which are large and
     * numerous; the small packets stay on {@link encode}, where a trip through the pool
     * would cost more than the compression itself.
     */
    public async encodeAsync(): Promise<void> {
        if (!this.compressed) {
            this.encode();
            return;
        }

        const deflated = await new Promise<Buffer>((resolve, reject) => {
            Zlib.deflateRaw(this.payload.getBuffer(), { level: this.compressionLevel }, (error, result) =>
                error ? reject(error) : resolve(result)
            );
        });

        // The same steps `encode` takes, in the same order, and that includes the two that
        // are easy to leave out here. Without the clear, a second call appended a whole
        // second batch frame to the first and put nonsense on the wire; without the flag,
        // this packet still claimed to be unencoded afterwards, so anything that checks -
        // `addPacket` does - would encode it all over again.
        this.clear();
        this.encodeHeader();
        this.writeByte(PacketCompressionAlgorithm.ZLIB);
        this.write(deflated);
        this.encoded = true;
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
