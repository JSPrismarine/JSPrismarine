import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import BinaryStream from '@jsprismarine/binaryutils';
import Zlib from 'zlib';
import { CompressionProvider } from '../CompressionProvider.js';
import type { ProtocolCodec } from '../codec/ProtocolCodec';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';

/**
 * @internal
 */
/** What the server compressed at before the level was configurable. */
export const DEFAULT_COMPRESSION_LEVEL = 7;

export default class BatchPacket extends FieldNetworkPacket {
    /** The batch envelope's single-byte wire id, the same at every protocol version. */
    public getId(): number {
        return 0xfe;
    }

    /**
     * Whether the payload is deflated behind the algorithm prefix byte. Callers set it from
     * the connection's negotiated state: nothing is compressed before `NetworkSettings`.
     */
    public compressed = true;
    private payload = new BinaryStream();

    /**
     * Higher means less bandwidth and more CPU. Measured on a 10 KiB chunk payload: level 7
     * costs 0.367 ms, level 1 costs 0.111 ms - so this is the dial between the two, and the
     * default keeps the bandwidth this server has always used.
     */
    public compressionLevel = DEFAULT_COMPRESSION_LEVEL;

    /** See {@link getPacketNames}. */
    private readonly packetNames: string[] = [];

    /**
     * The codec whose wire the batched packets encode for, when a session owns the send.
     * `MinecraftSession` sets it from the session before encoding, so a batch built from
     * base packet classes carries the negotiated version's layouts and wire ids. Unset -
     * tests and decode-side batches - a packet encodes as its own class, as it always did.
     */
    public codec?: ProtocolCodec;

    /** The packets {@link addPacket} took, encoded when the batch itself encodes. */
    private pending: NetworkPacket<unknown>[] = [];

    /**
     * Encodes what {@link addPacket} queued into the payload stream. Under a {@link codec},
     * every packet is converted to that codec's class and re-encoded under its wire id, even
     * one already encoded: a broadcast hands the same instance to one batch per codec, and
     * the bytes of the previous codec's encode must not leak into this one's.
     */
    private flushPending(): void {
        for (let packet of this.pending.splice(0, this.pending.length)) {
            if (this.codec !== undefined) {
                packet = this.codec.prepareOutbound(packet);
                const netId = this.codec.netIdOf(packet.getName());
                if (netId !== undefined) packet.setNetId(netId);
                packet.encode(this.codec.context);
            } else if (!packet.getEncoded()) {
                packet.encode();
            }

            this.payload.writeUnsignedVarInt(packet.getBuffer().byteLength);
            this.payload.write(packet.getBuffer());
        }
    }

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
        this.flushPending();
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

        this.flushPending();

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

    /**
     * Queues a packet for the batch. Encoding happens when the batch encodes, under
     * {@link codec} when one is set by then: at add time the batch does not yet know which
     * session - and so which protocol version - it is for.
     * @param packet - The packet to carry.
     */
    public addPacket(packet: NetworkPacket<unknown>): void {
        this.pending.push(packet);
        this.packetNames.push(packet.getName());
    }

    /**
     * The class names of the packets added so far, in the order they were added.
     *
     * The payload keeps only bytes, so this is the one record of what a batch carries that
     * the traffic log can name. A chunk batch sent through `MinecraftSession.sendBatchAsync`
     * left no `Sent` line at all, which hid every `LevelChunkPacket` from a join trace.
     * @returns {readonly string[]} One name per packet.
     */
    public getPacketNames(): readonly string[] {
        return this.packetNames;
    }

    public getPackets(): Buffer[] {
        this.flushPending();
        const stream = new BinaryStream(this.payload.getBuffer());
        const packets: Buffer[] = [];
        do {
            // VarUint: packet length
            packets.push(stream.read(stream.readUnsignedVarInt()));
        } while (!stream.feof());
        return packets;
    }
}
