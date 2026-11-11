import { BatchCodec, EncryptionCodec, NetworkBinaryStream } from '@jsprismarine/protocol';
import { EventEmitter } from 'node:events';
import { SendPriority } from './ITransport';

import type { Logger } from '@jsprismarine/logger';
import type { CompressionSettings, NetworkPacket } from '@jsprismarine/protocol';
import ClientPacketRegistry from './ClientPacketRegistry';
import type { ClientContext, ClientPacketHandler, ClientPhase } from './ClientHandler';
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

    /** Batches received and not yet decoded and emitted. */
    private pendingBatches = 0;

    /** Sends still compressing, which have not reached the transport yet. */
    private readonly pendingSends = new Set<Promise<void>>();

    /** Work packet handlers and listeners started, still running. */
    private readonly pendingWork = new Set<Promise<unknown>>();

    /** The phase whose handlers run; the login sequence moves it to `play`. */
    private phase: ClientPhase = 'login';

    /** What every handler is handed. */
    private readonly context: ClientContext;

    public constructor(
        private readonly transport: ITransport,
        private readonly registry: ClientPacketRegistry,
        private readonly logger: Logger
    ) {
        super();
        this.context = { session: this, log: logger };

        this.transport.on('batch', (payload) => {
            this.pendingBatches++;
            // One failure must not poison the chain for every batch behind it.
            this.inbound = this.inbound
                .then(() => this.handleBatch(payload))
                .catch(() => {})
                .finally(() => this.pendingBatches--);
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
     *
     * Not on a transport that encrypts the wire itself: over NetherNet, Bedrock Dedicated Server
     * sends the handshake but keeps batches in the clear under DTLS, and so does this client.
     * @param key - the 32 bytes derived from the shared secret and the server's salt.
     */
    public enableEncryption(key: Buffer): void {
        if (this.transport.encrypted === true) return;
        this.encryption = new EncryptionCodec(key);
    }

    public isEncryptionEnabled(): boolean {
        return this.encryption !== null;
    }

    public isCompressionEnabled(): boolean {
        return this.codec.isCompressionEnabled();
    }

    /** The phase this session is in, which decides the handlers a packet reaches. */
    public getPhase(): ClientPhase {
        return this.phase;
    }

    /**
     * Moves the session to another phase. A packet decoded after this reaches only the handlers
     * that accept the new one.
     * @param phase - The phase to move to.
     */
    public setPhase(phase: ClientPhase): void {
        this.phase = phase;
    }

    /**
     * Registers a handler for the packets one class decodes; see
     * {@link ClientPacketRegistry.registerHandler}.
     *
     * A handler runs as its packet is read, after the session's `packet` event. What it returns
     * is counted by {@link ClientSession.isIdle} until it settles, and a failure is logged as a
     * warning.
     * @param packet - The packet class whose payload the handler takes.
     * @param handler - The handler.
     * @returns A function that removes the handler again.
     */
    public registerHandler<T>(packet: new () => NetworkPacket<T>, handler: ClientPacketHandler<T>): () => void {
        return this.registry.registerHandler(packet, handler);
    }

    /**
     * Serializes a packet, batches it and hands it to the transport.
     * @param packet - a packet already carrying its data.
     * @param priority - IMMEDIATE for anything the handshake is waiting on.
     */
    public async send(packet: NetworkPacket<any>, priority: SendPriority = SendPriority.NORMAL): Promise<void> {
        const stream = new NetworkBinaryStream();
        const encoded = packet.serialize(stream);

        const sending = this.codec.encodeAsync([encoded]).then((batch) => {
            this.transport.send(this.encryption?.encrypt(batch) ?? batch, priority);
        });
        this.pendingSends.add(sending);
        try {
            await sending;
        } finally {
            this.pendingSends.delete(sending);
        }
    }

    /**
     * Whether every batch received so far has been handled and every send has reached the
     * transport. A harness that steps a server in the same process reads it to know the client
     * has nothing left to say before it runs the next tick.
     */
    public isIdle(): boolean {
        return this.pendingBatches === 0 && this.pendingSends.size === 0 && this.pendingWork.size === 0;
    }

    /** Resolves once {@link ClientSession.isIdle} holds, including for work that work started. */
    public async settled(): Promise<void> {
        while (!this.isIdle()) {
            await Promise.allSettled([this.inbound, ...this.pendingSends, ...this.pendingWork]);
        }
    }

    /**
     * Counts work a packet listener started until it settles, so {@link ClientSession.isIdle}
     * stays false meanwhile. The session does this itself for what a registered handler
     * returns, such as signing a login or answering a dimension change.
     *
     * A listener runs synchronously inside the batch that carried its packet, but what it
     * awaits finishes later, and a reply it sends after that await is not yet a send this
     * session knows about. Without this a stepped harness can see an idle client while the
     * client still has something to say, and run the next tick ahead of it.
     * @param work - The listener's work. Its failure is the caller's to handle.
     * @returns The same work, for the caller to chain on.
     */
    public track<T>(work: Promise<T>): Promise<T> {
        this.pendingWork.add(work);
        const forget = (): void => void this.pendingWork.delete(work);
        work.then(forget, forget);
        return work;
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
            for (const work of this.registry.dispatch(decoded, this.phase, this.context)) {
                this.track(work).catch((error: unknown) => {
                    this.logger.warn(
                        `Client/ClientSession: the ${decoded.name} handler failed: ${
                            error instanceof Error ? error.message : String(error)
                        }`,
                        'Client/ClientSession/handleBatch'
                    );
                });
            }
            this.emit(`packet:${decoded.id}`, decoded.data);
        }
    }
}
