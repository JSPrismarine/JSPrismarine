import { BatchCodec, EncryptionCodec, NetworkBinaryStream } from '@jsprismarine/protocol';
import { EventEmitter } from 'node:events';
import { SendPriority } from './ITransport';

import type { Logger } from '@jsprismarine/logger';
import type { CompressionSettings, NetworkPacket } from '@jsprismarine/protocol';
import ClientPacketRegistry from './ClientPacketRegistry';
import type { ITransport } from './ITransport';

/**
 * The Minecraft layer on top of a transport: batching, compression, and turning bytes into
 * decoded packets.
 *
 * The counterpart of the server's `MinecraftSession`, and it has the same job, but it owns
 * one thing that one does not: the compression state machine. A client sends
 * `RequestNetworkSettings` and receives `NetworkSettings` with no algorithm prefix on either,
 * and from the packet after that every batch carries one. Getting that transition wrong does
 * not fail loudly - the first compressed batch is read as if its prefix byte were part of a
 * packet length, and the connection dies several packets later with a decode error that
 * points at the wrong packet entirely.
 */
export default class ClientSession extends EventEmitter {
    private codec = BatchCodec.uncompressed();

    /**
     * The encryption layer, or null before the handshake.
     *
     * Kept beside the codec rather than inside it because the two are negotiated separately
     * and in that order: compression is agreed before the login goes out, encryption only
     * after the server has read it.
     */
    private encryption: EncryptionCodec | null = null;

    /**
     * Tail of the inbound chain: batches are decoded one after another, never concurrently.
     *
     * Decoding is asynchronous because inflating happens on libuv's thread pool, and left to
     * itself that reorders the stream - a batch takes as long as its *size* says, so a large
     * one is overtaken by every small one that arrives while it is still inflating. RakNet
     * delivered them reliably ordered and the server sent them in an order it meant; a
     * 37 KiB StartGame that surfaces after the PlayStatus which was supposed to follow it is
     * not a slow StartGame, it is a missing one.
     *
     * This is the receiving mirror of the chain `MinecraftSession` keeps on the way out, and
     * it exists for the same reason: what matters is the order things were *asked for*, not
     * the order the work happened to finish in.
     */
    private inbound: Promise<void> = Promise.resolve();

    public constructor(
        private readonly transport: ITransport,
        private readonly registry: ClientPacketRegistry,
        private readonly logger: Logger
    ) {
        super();

        this.transport.on('batch', (payload) => {
            // One failure must not poison the chain for every batch behind it.
            this.inbound = this.inbound.then(() => this.handleBatch(payload)).catch(() => {});
        });
    }

    /**
     * Switches to the negotiated compression, once and in one place.
     * @param settings - what `NetworkSettings` agreed to.
     */
    public enableCompression(settings: CompressionSettings): void {
        this.codec = BatchCodec.compressed(settings);
    }

    /**
     * Switches encryption on, in both directions at once.
     *
     * Once and never off, and both directions together: the server enables its own the moment
     * it sends the handshake, so the very next batch either way is encrypted. There is no
     * packet that is sent in the clear after this point, including the
     * `ClientToServerHandshake` that acknowledges it.
     * @param key - the 32 bytes derived from the shared secret and the server's salt.
     */
    public enableEncryption(key: Buffer): void {
        this.encryption = new EncryptionCodec(key);
    }

    public isEncryptionEnabled(): boolean {
        return this.encryption !== null;
    }

    public isCompressionEnabled(): boolean {
        return this.codec.isCompressionEnabled();
    }

    /**
     * Serializes a packet, batches it and hands it to the transport.
     * @param packet - a packet already carrying its data.
     * @param priority - IMMEDIATE for anything the handshake is waiting on.
     */
    public async send(packet: NetworkPacket<any>, priority: SendPriority = SendPriority.NORMAL): Promise<void> {
        const stream = new NetworkBinaryStream();
        const encoded = packet.serialize(stream);

        const batch = await this.codec.encodeAsync([encoded]);

        this.transport.send(this.encryption?.encrypt(batch) ?? batch, priority);
    }

    /** The handshake steps, which the server is blocking on and must not be held behind anything. */
    public async sendImmediate(packet: NetworkPacket<any>): Promise<void> {
        return this.send(packet, SendPriority.IMMEDIATE);
    }

    private async handleBatch(payload: Buffer): Promise<void> {
        let packets: Buffer[];

        try {
            packets = await this.codec.decodeAsync(this.encryption?.decrypt(payload) ?? payload);
        } catch (error: unknown) {
            // A batch we cannot split is a protocol disagreement, not a bad packet: every
            // packet inside it is lost, so it is worth saying so at a level somebody sees.
            this.logger.error(
                `Client/ClientSession/handleBatch: failed to decode a batch of ${payload.byteLength} bytes: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
            return;
        }

        for (const buffer of packets) {
            let decoded;

            try {
                // Every packet as it came off the wire, before anything is done with it -
                // including the ones nothing is registered for. This is the "what is this
                // server sending?" question, and the only way to answer it for a packet this
                // client cannot yet read.
                this.emit('raw', { id: ClientPacketRegistry.readPacketId(buffer), buffer });

                decoded = this.registry.decode(buffer);
            } catch (error: unknown) {
                // One packet failing to decode must not cost the rest of its batch. A
                // partially implemented codec is the normal state of this client, and the
                // packet after the broken one is often the one that matters.
                this.logger.warn(
                    `Failed to decode packet 0x${buffer[0]?.toString(16)}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                    'Client/ClientSession/handleBatch'
                );
                continue;
            }

            if (decoded === null) continue;

            this.logger.silly(`Received §b${decoded.name}§r`);
            this.emit('packet', decoded);
            this.emit(`packet:${decoded.id}`, decoded.data);
        }
    }
}
