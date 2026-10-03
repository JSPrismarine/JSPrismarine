import BinaryStream from '@jsprismarine/binaryutils';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { CompressionCodec, type CompressionSettings } from './CompressionCodec';

/** The id every batch carries, and the only packet id RakNet ever sees from Minecraft. */
export const BATCH_PACKET_ID = 0xfe;

/**
 * A batch: the outermost Minecraft layer, sitting directly inside a RakNet frame.
 *
 * ```
 * 0xFE │ [algorithm byte] │ ⟨varint len, packet⟩ ⟨varint len, packet⟩ …
 * ```
 *
 * The algorithm byte is present if and only if compression has been *negotiated* - which is
 * not the same as this batch being compressed, and conflating the two is the trap here. A
 * connection sends `RequestNetworkSettings` and receives `NetworkSettings` with no prefix at
 * all; from the packet after that one, every batch carries a prefix, and a peer is free to
 * make it {@link UNCOMPRESSED_BATCH} whenever compressing would not pay. So the two states
 * are two codecs - {@link BatchCodec.uncompressed} and {@link BatchCodec.compressed} - and a
 * connection replaces one with the other exactly once.
 *
 * Nothing here knows what a packet *is*: a batch is a list of opaque buffers. That is what
 * lets a proxy route on ids it has no definition for, and what keeps this usable from both
 * sides of a connection.
 */
export class BatchCodec {
    private constructor(private readonly compression: CompressionCodec | null) {}

    /**
     * The pre-negotiation form, carrying no algorithm byte. Only `RequestNetworkSettings`
     * and `NetworkSettings` itself travel this way.
     */
    public static uncompressed(): BatchCodec {
        return new BatchCodec(null);
    }

    /** The post-negotiation form: every batch carries an algorithm byte. */
    public static compressed(settings: CompressionSettings | CompressionCodec): BatchCodec {
        return new BatchCodec(settings instanceof CompressionCodec ? settings : new CompressionCodec(settings));
    }

    /** Whether compression has been negotiated, i.e. whether batches carry a prefix byte. */
    public isCompressionEnabled(): boolean {
        return this.compression !== null;
    }

    public encode(packets: readonly Buffer[]): Buffer {
        const payload = BatchCodec.joinPackets(packets);

        if (this.compression === null) {
            return Buffer.concat([Buffer.from([BATCH_PACKET_ID]), payload]);
        }

        const algorithm = this.compression.algorithmFor(payload.byteLength);
        return BatchCodec.frame(algorithm, this.compression.compress(payload));
    }

    /** The same, with the deflate handed to zlib's asynchronous API. */
    public async encodeAsync(packets: readonly Buffer[]): Promise<Buffer> {
        const payload = BatchCodec.joinPackets(packets);

        if (this.compression === null) {
            return Buffer.concat([Buffer.from([BATCH_PACKET_ID]), payload]);
        }

        const algorithm = this.compression.algorithmFor(payload.byteLength);
        return BatchCodec.frame(algorithm, await this.compression.compressAsync(payload));
    }

    public decode(batch: Buffer): Buffer[] {
        const { algorithm, body } = this.split(batch);

        return BatchCodec.splitPackets(this.compression === null ? body : this.compression.decompress(algorithm, body));
    }

    /** The same, with the inflate handed to zlib's asynchronous API. */
    public async decodeAsync(batch: Buffer): Promise<Buffer[]> {
        const { algorithm, body } = this.split(batch);

        return BatchCodec.splitPackets(
            this.compression === null ? body : await this.compression.decompressAsync(algorithm, body)
        );
    }

    private static frame(algorithm: PacketCompressionAlgorithm, body: Buffer): Buffer {
        return Buffer.concat([Buffer.from([BATCH_PACKET_ID, CompressionCodec.toPrefix(algorithm)]), body]);
    }

    /** Strips the id and, when compression is on, the algorithm byte. */
    private split(batch: Buffer): { algorithm: PacketCompressionAlgorithm; body: Buffer } {
        if (batch.byteLength < 1 || batch[0] !== BATCH_PACKET_ID) {
            throw new Error(
                `Not a batch: expected id 0x${BATCH_PACKET_ID.toString(16)}, got 0x${batch[0]?.toString(16)}`
            );
        }

        if (this.compression === null) {
            return { algorithm: PacketCompressionAlgorithm.NONE, body: batch.subarray(1) };
        }

        if (batch.byteLength < 2) {
            throw new Error('Truncated batch: compression is negotiated but the algorithm byte is missing');
        }

        return { algorithm: CompressionCodec.fromPrefix(batch[1]!), body: batch.subarray(2) };
    }

    private static joinPackets(packets: readonly Buffer[]): Buffer {
        const stream = new BinaryStream();
        for (const packet of packets) {
            stream.writeUnsignedVarInt(packet.byteLength);
            stream.write(packet);
        }

        return stream.getBuffer();
    }

    /**
     * Splits the decompressed payload back into packets.
     *
     * A manual cursor rather than a `BinaryStream`, for the offsets: every length here is
     * peer-controlled and has to be checked against what is actually left, and saying
     * *where* a batch went wrong is most of the value of noticing. An empty payload yields
     * no packets rather than throwing - the `do/while` this replaced always ran once and
     * tried to read a varint out of nothing.
     */
    private static splitPackets(payload: Buffer): Buffer[] {
        const packets: Buffer[] = [];
        let cursor = 0;

        while (cursor < payload.byteLength) {
            const start = cursor;
            const { value: length, next } = BatchCodec.readUnsignedVarInt(payload, cursor);
            cursor = next;

            if (length === 0) {
                throw new Error(`Malformed batch: zero length packet at offset ${start}`);
            }
            if (length > payload.byteLength - cursor) {
                throw new Error(
                    `Malformed batch: packet at offset ${start} declares ${length} bytes, ${
                        payload.byteLength - cursor
                    } remain`
                );
            }

            packets.push(payload.subarray(cursor, cursor + length));
            cursor += length;
        }

        return packets;
    }

    /** LEB128, matching `BinaryStream.readUnsignedVarInt` including its over-long rejection. */
    private static readUnsignedVarInt(buffer: Buffer, offset: number): { value: number; next: number } {
        let value = 0;
        let cursor = offset;

        for (let shift = 0; shift <= 28; shift += 7) {
            if (cursor >= buffer.byteLength) {
                throw new Error(`Malformed batch: varint at offset ${offset} runs past the end of the payload`);
            }

            const byte = buffer[cursor++]!;
            value |= (byte & 0x7f) << shift;

            if ((byte & 0x80) === 0) {
                // Bits above the 32nd would otherwise be shifted off and discarded, so an
                // over-long encoding such as `ff ff ff ff 7f` would decode to the same
                // value as the canonical `ff ff ff ff 0f`.
                if (shift === 28 && (byte & 0x70) !== 0) {
                    throw new Error(`Malformed batch: varint at offset ${offset} overflows 32 bits`);
                }

                // `>>> 0` because the accumulator is int32: without it everything from 2^31
                // up comes back negative.
                return { value: value >>> 0, next: cursor };
            }
        }

        throw new Error(`Malformed batch: varint at offset ${offset} did not terminate after 5 bytes`);
    }
}
