import type { Logger } from '@jsprismarine/logger';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import { CompressionThreshold } from '@jsprismarine/protocol';
import HandshakeCodec from './codec/HandshakeCodec';
import type { EncryptionCodec, ProtocolCodec } from '@jsprismarine/protocol';
import type { TransportCapabilities, TransportConnection } from './transport/Transport';
import type { encodePacketBatch } from './encodePacketBatch';
import {
    encodePacketBatchAsync,
    encodePacketBatchBySize,
    encodePacketBatchFromBuffersBySize,
    encodePacketsForCodec
} from './encodePacketBatch';
import type { PacketBatchOptions } from './encodePacketBatch';
import { DEFAULT_COMPRESSION_LEVEL } from '@jsprismarine/protocol';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PacketLogFilter } from './PacketLogFilter';
import type { OutboundPacketRecorder } from './OutboundPacketTrace';

/**
 * The packet class names a debugging variable lists, comma-separated.
 *
 * Two variables use this. `JSP_DEBUG_DROP_PACKETS` names clientbound packets that never
 * reach the wire, which bisects a join stream one packet type at a time against a client
 * that leaves without saying why. `JSP_DEBUG_DUMP_PACKETS` names packets whose encoded bytes
 * are written to a file, one per packet, so what a real client was given can be decoded
 * offline. Both leave a warn line per packet. Read when a session is created, from the
 * environment the server was started with.
 * @param {string | undefined} value - The variable's value.
 * @returns {ReadonlySet<string>} The names listed, empty when the variable is unset.
 */
export const debugPacketNames = (value: string | undefined): ReadonlySet<string> =>
    new Set(
        (value ?? '')
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name.length > 0)
    );

/** Where `JSP_DEBUG_DUMP_PACKETS` files go unless `JSP_DEBUG_DUMP_DIR` says otherwise. */
const defaultDumpDir = (): string => process.env.JSP_DEBUG_DUMP_DIR ?? path.join(os.tmpdir(), 'jsprismarine-packets');

/** Bound queued packet bodies so traffic outside a world tick still gets framed promptly. */
const OUTBOUND_QUEUE_BYTE_LIMIT = 64 * 1024;

interface QueuedPacket {
    readonly packet: NetworkPacket<unknown>;
    readonly buffer: Buffer;
    readonly options: PacketBatchOptions;
    readonly direct: boolean;
    readonly resolve: () => void;
    readonly reject: (error: unknown) => void;
    readonly done: Promise<void>;
}

const sameBatchOptions = (left: PacketBatchOptions, right: PacketBatchOptions): boolean => {
    // `undefined` means the BatchCodec default, so default `sendPackets` and `sendDataPacket`
    // calls can share a queue even though only the latter spells out `compressed: true`.
    const leftCompressed = left.compressed ?? true;
    const rightCompressed = right.compressed ?? true;
    if (leftCompressed !== rightCompressed) return false;
    if (!leftCompressed) return true;

    // The algorithm selects the batch prefix and decoder, so mixing algorithms corrupts a frame.
    return (
        (left.compressionAlgorithm ?? PacketCompressionAlgorithm.ZLIB) ===
            (right.compressionAlgorithm ?? PacketCompressionAlgorithm.ZLIB) &&
        (left.compressionLevel ?? DEFAULT_COMPRESSION_LEVEL) ===
            (right.compressionLevel ?? DEFAULT_COMPRESSION_LEVEL) &&
        (left.compressionThreshold ?? 1) === (right.compressionThreshold ?? 1)
    );
};

/**
 * The layer between a `ClientConnection` and its transport: coalesces queued packet buffers
 * into batches, frames them in the order they were asked for, and logs what went out.
 *
 * Whether a batch is compressed is the caller's decision, taken from the connection's
 * negotiated state. `RequestNetworkSettingsHandler` sends `NetworkSettings` uncompressed
 * and flips `ClientConnection.hasCompression` at the same time, so the next packet in either
 * direction is the first one with an algorithm prefix. Encryption starts with
 * {@link MinecraftSession.startEncryption}, after the login handler has sent
 * `ServerToClientHandshake`; a login that names no identity key stays plaintext, and the
 * transport's own `capabilities.encrypted` says whether the wire covers it.
 */
export default class MinecraftSession {
    /**
     * The protocol codec this session speaks. Every session starts on the layout-stable
     * handshake codec, which knows only the packets a connection may exchange before a
     * version is agreed; `RequestNetworkSettingsHandler` reassigns it from the codec
     * registry once the client announces its protocol version.
     */
    public codec: ProtocolCodec = HandshakeCodec;

    /** The batch algorithm this connection advertised in its `NetworkSettings` packet. */
    public compressionAlgorithm = PacketCompressionAlgorithm.ZLIB;

    /** The negotiated minimum batch size; zero disables compression. */
    public compressionThreshold: number = CompressionThreshold.COMPRESS_EVERYTHING;

    protected readonly connection: TransportConnection;

    /** Set once the encryption handshake has been sent; every frame in either direction goes through it. */
    private encryption: EncryptionCodec | undefined;

    /**
     * Tail of the outbound chain, and how many asynchronous sends have not framed yet.
     *
     * The transport stamps a message's order index inside `sendFrame`, which is to say at
     * the moment it is framed and not at the moment it was asked for. Everything here goes
     * out reliable ordered on one channel - `capabilities.reliableOrdered` - so that stamp
     * *is* the order the client applies things in. A chunk batch that stops to compress used
     * to let anything sent meanwhile jump in front of it: send a LevelChunk, break a block
     * while zlib is still working, and the UpdateBlock took the lower index - the client
     * applied the break, then laid the older chunk snapshot over the top of it and the block
     * came back. Two chunk batches could likewise finish compressing in the opposite order
     * to the one they were queued in.
     *
     * So framing follows the order the sends were requested, not the order the work
     * finished. The counter keeps direct and shared batches off the promise chain when there
     * is no asynchronous send to get behind; ordinary single-packet sends use the separate
     * coalescing queue and its explicit flush points.
     */
    private outbound: Promise<void> = Promise.resolve();
    private pendingAsyncSends = 0;
    private outboundPacketRecorder: OutboundPacketRecorder | undefined;
    private outboundConnectionId: number | undefined;
    private outboundTick: (() => number) | undefined;
    private nextOutboundSequence = 0;
    private queuedPackets: QueuedPacket[] = [];
    private queuedPacketBytes = 0;
    private queuedBatchOptions: PacketBatchOptions | undefined;
    private flushScheduled = false;

    public constructor(
        connection: TransportConnection,
        private readonly logger: Logger,
        private readonly logFilter: PacketLogFilter = new PacketLogFilter(),
        private readonly dropped: ReadonlySet<string> = debugPacketNames(process.env.JSP_DEBUG_DROP_PACKETS),
        private readonly dumped: ReadonlySet<string> = debugPacketNames(process.env.JSP_DEBUG_DUMP_PACKETS),
        private readonly dumpDir: string = defaultDumpDir(),
        private readonly getCompressionLevel?: () => number,
        private readonly getCompressionThreshold?: () => number
    ) {
        this.connection = connection;
    }

    /** Enables opt-in output capture after the dispatcher assigns this connection its id. */
    public setOutboundPacketRecorder(
        recorder: OutboundPacketRecorder,
        connectionId: number,
        getTick: () => number
    ): void {
        this.outboundPacketRecorder = recorder;
        this.outboundConnectionId = connectionId;
        this.outboundTick = getTick;
    }

    /** Stores the settings that subsequent inbound and outbound batches use. */
    public setCompressionSettings(algorithm: PacketCompressionAlgorithm, threshold: number): void {
        this.compressionAlgorithm = algorithm;
        this.compressionThreshold = threshold;
    }

    /** Frames now if nothing is waiting to be framed, otherwise behind whatever is. */
    private ordered(frame: () => void): Promise<void> {
        if (this.pendingAsyncSends === 0) {
            frame();
            return Promise.resolve();
        }

        return this.chain(async () => frame());
    }

    /** Appends to the outbound chain, keeping one failure from poisoning it for the rest. */
    private chain(work: () => Promise<void>): Promise<void> {
        const next = this.outbound.then(work);
        this.outbound = next.catch(() => {});

        return next;
    }

    /**
     * Encodes packets into a batch, or appends their bytes to the per-session queue when
     * `direct` is false.
     */
    public sendPackets(
        packets: readonly NetworkPacket<unknown>[],
        { direct = true, ...batchOptions }: PacketBatchSendOptions = {}
    ): void {
        if (this.dropsPackets(packets)) return;

        const options = this.withCompressionOptions({
            compressionAlgorithm: this.compressionAlgorithm,
            compressionThreshold: this.compressionThreshold,
            ...batchOptions
        });
        if (!direct) {
            for (const packet of packets) this.enqueuePacket(packet, options, false);
            return;
        }

        // Preserve request order when an urgent batch follows packets waiting for the tick
        // flush or the setImmediate fallback.
        void this.flushOutboundPackets().catch((error: unknown) => this.logger.error(error));

        const batch = encodePacketBatchBySize(packets, this.codec, options);
        if (batch instanceof Promise) {
            this.pendingAsyncSends++;
            void this.chain(async () => {
                try {
                    const encoded = await batch;
                    this.frameAndRecord(encoded.content, encoded.packets, direct, encoded.packetBuffers);
                } catch (error: unknown) {
                    this.logger.error(error);
                }
            })
                .catch((error: unknown) => this.logger.error(error))
                .finally(() => this.pendingAsyncSends--);
            return;
        }

        void this.ordered(() => this.frameAndRecord(batch.content, batch.packets, direct, batch.packetBuffers));
    }

    /**
     * The same, with the compression handed to zlib's asynchronous API.
     *
     * Node runs that on the libuv thread pool, so the work leaves the main thread instead of
     * merely being deferred on it. Worth the extra await for chunk batches, which are the
     * large and frequent ones; everything else stays on {@link sendPackets}, where a trip
     * through the pool would cost more than compressing a small packet does.
     */
    public async sendPacketsAsync(
        packets: readonly NetworkPacket<unknown>[],
        { direct = true, ...batchOptions }: PacketBatchSendOptions = {}
    ): Promise<void> {
        if (this.dropsPackets(packets)) return;

        void this.flushOutboundPackets().catch((error: unknown) => this.logger.error(error));

        this.pendingAsyncSends++;
        try {
            await this.chain(async () => {
                const batch = await encodePacketBatchAsync(packets, this.codec, {
                    ...this.withCompressionOptions(batchOptions),
                    compressionAlgorithm: this.compressionAlgorithm,
                    compressionThreshold: this.compressionThreshold
                });
                this.frameAndRecord(batch.content, batch.packets, direct, batch.packetBuffers);

                // One line per packet, as `sendDataPacket` writes, so a join trace shows the
                // chunks between the publisher updates instead of a gap where they went out.
                if (this.logger.isEnabled('silly')) {
                    for (const packet of batch.packets) {
                        const name = packet.getName();
                        if (this.logFilter.shouldLogName(name)) this.logger.silly(`Sent §b${name}§r packet`);
                    }
                }
            });
        } finally {
            this.pendingAsyncSends--;
        }
    }

    /**
     * Frames a batch somebody else has already encoded.
     *
     * The counterpart to {@link sendPackets}, which encodes what it is handed. This takes the
     * finished bytes, so one compression can serve every recipient of a broadcast - the same
     * `UpdateBlockPacket` going to twenty players was twenty deflates of identical bytes.
     *
     * It must never be given a batch that has not been encoded; there is nothing here that
     * would notice. A separate entry point rather than a flag on `sendPackets` precisely because
     * `sendPackets` encodes its own packets and packet encoding begins by clearing
     * the buffer - reusing it for a fan-out would recompress per recipient *and* invalidate
     * the bytes already handed out.
     * @param {Buffer} content - The encoded, compressed batch.
     * @param packets - The version-specific packets inside it, for drops and traffic logs.
     * @param {boolean} [direct=false] - Force a datagram of its own.
     * @param packetBuffers - Their encoded bytes for packet diagnostics.
     */
    public async sendSharedBatch(
        content: Buffer,
        packets: readonly NetworkPacket<unknown>[],
        direct = false,
        packetBuffers?: readonly Buffer[]
    ): Promise<void> {
        void this.flushOutboundPackets().catch((error: unknown) => this.logger.error(error));
        await this.ordered(() => this.frameSharedBatch(content, packets, direct, packetBuffers));
    }

    /**
     * Queues a shared batch whose cached compression has not finished yet.
     * Reserve its outbound slot before awaiting compression so later packets cannot overtake it.
     * @param batchPromise - The cached batch bytes once encoding and compression finish.
     * @param failedPacket - The packet to name if encoding or compression fails.
     * @returns Completion of this send's ordered framing slot.
     */
    public async sendSharedBatchAsync(
        batchPromise: Promise<ReturnType<typeof encodePacketBatch>>,
        failedPacket: NetworkPacket<unknown>
    ): Promise<void> {
        void this.flushOutboundPackets().catch((error: unknown) => this.logger.error(error));
        this.pendingAsyncSends++;
        await this.chain(async () => {
            let batch: ReturnType<typeof encodePacketBatch>;
            try {
                batch = await batchPromise;
            } catch (error: unknown) {
                this.logPacketEncodeFailure(failedPacket, error);
                return;
            }
            this.frameSharedBatch(batch.content, batch.packets, false, batch.packetBuffers);
        }).finally(() => this.pendingAsyncSends--);
    }

    /**
     * Queues an already encoded shared batch in order.
     *
     * This has a separate name from {@link MinecraftSession.sendSharedBatchAsync} because cached
     * bytes need no compression promise, and keeping the input types distinct preserves contextual
     * typing for callers that prepare a batch asynchronously.
     * @param content - The shared compressed bytes.
     * @param packets - The packets represented by those bytes.
     * @param direct - Whether to force a separate datagram.
     * @param packetBuffers - Encoded packet bytes for diagnostics.
     * @returns Completion of this send's ordered framing slot.
     */
    public async sendSharedCompressedBatchAsync(
        content: Buffer,
        packets: readonly NetworkPacket<unknown>[],
        direct = false,
        packetBuffers?: readonly Buffer[]
    ): Promise<void> {
        void this.flushOutboundPackets().catch((error: unknown) => this.logger.error(error));
        this.pendingAsyncSends++;
        try {
            await this.chain(async () => {
                const representative = packets[0];
                if (representative !== undefined) this.dump(representative, packetBuffers?.[0]);
                if (this.dropsPackets(packets)) return;
                this.frameAndRecord(content, packets, direct, packetBuffers);
                for (const packet of packets) {
                    const name = packet.getName();
                    if (this.logFilter.shouldLogName(name)) this.logger.silly(`Sent §b${name}§r packet`);
                }
            });
        } finally {
            this.pendingAsyncSends--;
        }
    }

    private frameSharedBatch(
        content: Buffer,
        packets: readonly NetworkPacket<unknown>[],
        direct: boolean,
        packetBuffers?: readonly Buffer[]
    ): void {
        const representative = packets[0];
        if (representative !== undefined) this.dump(representative, packetBuffers?.[0]);
        if (this.dropsPackets(packets)) return;

        this.frameAndRecord(content, packets, direct, packetBuffers);
        if (
            representative !== undefined &&
            this.logger.isEnabled('silly') &&
            this.logFilter.shouldLog(representative)
        ) {
            this.logger.silly(`Sent §b${representative.getName()}§r packet`);
        }
    }

    private frame(content: Buffer, direct: boolean): void {
        this.connection.sendFrame(this.encryption?.encrypt(content) ?? content, direct);
    }

    /**
     * Encrypts every frame framed from now on, and expects the same of every frame received.
     *
     * Call it once the `ServerToClientHandshake` has been framed: that packet is the last one
     * the client reads in the clear. The stream is continuous, so a frame framed before this
     * call must not be sent after it.
     * @param codec - The codec both ends derived their key for.
     */
    public startEncryption(codec: EncryptionCodec): void {
        this.encryption = codec;
    }

    /** What the transport under this session does on its own, such as encrypting the wire. */
    public get transportCapabilities(): TransportCapabilities {
        return this.connection.capabilities;
    }

    /** Whether frames are encrypted in both directions. */
    public get isEncrypted(): boolean {
        return this.encryption !== undefined;
    }

    /**
     * The frame a client sent, decrypted when the session is encrypted.
     * @throws when the checksum disagrees, which means the frame was altered, dropped or replayed.
     */
    public decryptFrame(frame: Buffer): Buffer {
        return this.encryption?.decrypt(frame) ?? frame;
    }

    /** Reads the tick after queued work finishes, at the same boundary where the frame is sent. */
    private frameAndRecord(
        content: Buffer,
        packets: readonly NetworkPacket<unknown>[],
        direct: boolean,
        packetBuffers?: readonly Buffer[]
    ): void {
        const tick = this.outboundPacketRecorder === undefined ? undefined : this.outboundTick?.();
        this.frame(content, direct);
        this.recordOutbound(packets, tick, packetBuffers);
    }

    /** Records encoded packet bytes after their batch reaches the transport queue. */
    private recordOutbound(
        packets: readonly NetworkPacket<unknown>[],
        tick: number | undefined,
        packetBuffers?: readonly Buffer[]
    ): void {
        const recorder = this.outboundPacketRecorder;
        const connectionId = this.outboundConnectionId;
        if (recorder === undefined || connectionId === undefined || tick === undefined) return;

        for (const [index, packet] of packets.entries()) {
            const sequence = this.nextOutboundSequence;
            this.nextOutboundSequence += 1;
            try {
                recorder.record({
                    connectionId,
                    sequence,
                    tick,
                    protocolVersion: this.codec.protocolVersion,
                    packetName: packet.getName(),
                    // Transient encoding deliberately leaves `getBuffer()` uncached, so record the exact view
                    // that was batched for the wire.
                    payload: Buffer.from(packetBuffers?.[index] ?? packet.getBuffer())
                });
            } catch (error: unknown) {
                // Output capture is diagnostic; a sink failure must not strand a framed packet.
                this.logger.error(`Outbound packet recorder failed for ${packet.getName()}: ${error}`);
                this.logger.error(error);
            }
        }
    }

    public async sendDataPacket(packet: NetworkPacket<unknown>, comp = true, direct = false): Promise<void> {
        const options = this.withCompressionOptions({
            compressed: comp,
            compressionAlgorithm: this.compressionAlgorithm,
            compressionThreshold: this.compressionThreshold
        });
        let encodedPacket: NetworkPacket<unknown>;
        let buffer: Buffer;
        try {
            const encoded = encodePacketsForCodec([packet], this.codec);
            const prepared = encoded.packets[0];
            const packetBuffer = encoded.buffers[0];
            if (prepared === undefined || packetBuffer === undefined)
                throw new Error('Packet encoding returned no bytes');
            encodedPacket = prepared;
            buffer = packetBuffer;
        } catch (error: unknown) {
            this.logPacketEncodeFailure(packet, error);
            return;
        }

        if (this.dropped.has(packet.getName())) {
            // Transient encoding does not populate `packet.getBuffer()`, so dump the captured bytes.
            this.dump(encodedPacket, buffer);
            this.drops(packet.getName());
            return;
        }

        // A direct send is its own flush point. Compression changes and the byte cap are also
        // boundaries. Reserve the older queue synchronously so concurrent sends cannot mix modes.
        const needsBoundary =
            direct ||
            (this.queuedBatchOptions !== undefined && !sameBatchOptions(this.queuedBatchOptions, options)) ||
            this.queuedPacketBytes + buffer.byteLength > OUTBOUND_QUEUE_BYTE_LIMIT;
        const previousFlush = needsBoundary ? this.flushOutboundPackets() : Promise.resolve();

        const queued = this.enqueuePreparedPacket(encodedPacket, buffer, options, direct);
        if (direct || this.queuedPacketBytes >= OUTBOUND_QUEUE_BYTE_LIMIT) {
            const currentFlush = this.flushOutboundPackets();
            await Promise.all([previousFlush, currentFlush, queued.done]);
        } else {
            this.scheduleOutboundFlush();
            await Promise.all([previousFlush, queued.done]);
        }
    }

    /** Whether every packet sent so far has been framed; see {@link MinecraftSession.settleOutbound}. */
    public isOutboundSettled(): boolean {
        return this.queuedPackets.length === 0 && this.pendingAsyncSends === 0;
    }

    /**
     * Resolves once every packet sent so far has been framed: the queue is flushed and no
     * asynchronous encode is still in flight. A harness that steps the server waits on it so
     * that a packet counts toward the tick that sent it, whatever the host's speed.
     */
    public async settleOutbound(): Promise<void> {
        while (!this.isOutboundSettled()) {
            await this.flushOutboundPackets();
            await this.outbound;
        }
    }

    /**
     * Frames packets accumulated since the last queue boundary.
     * @returns Resolves after the batch holding these packets has been framed.
     */
    public async flushOutboundPackets(): Promise<void> {
        const queued = this.queuedPackets;
        if (queued.length === 0) return;

        this.queuedPackets = [];
        this.queuedPacketBytes = 0;
        this.queuedBatchOptions = undefined;

        const packets = queued.map(({ packet }) => packet);
        const buffers = queued.map(({ buffer }) => buffer);
        const options = queued[0]!.options;
        let batch: ReturnType<typeof encodePacketBatchFromBuffersBySize>;
        try {
            batch = encodePacketBatchFromBuffersBySize(packets, buffers, options);
        } catch (error: unknown) {
            for (const { packet, resolve } of queued) {
                this.logPacketEncodeFailure(packet, error);
                resolve();
            }
            return;
        }
        const frame = (content: Buffer): void => {
            try {
                // A packet may be prepared again under another session codec before this
                // queue flushes, so dump the captured bytes rather than its mutable stream.
                for (const { packet, buffer } of queued) this.dump(packet, buffer);
                this.frameAndRecord(
                    content,
                    packets,
                    queued.some(({ direct }) => direct),
                    buffers
                );
                if (this.logger.isEnabled('silly')) {
                    for (const { packet } of queued) {
                        if (this.logFilter.shouldLog(packet)) this.logger.silly(`Sent §b${packet.getName()}§r packet`);
                    }
                }
            } catch (error: unknown) {
                for (const { reject } of queued) reject(error);
                throw error;
            }
            for (const { resolve } of queued) resolve();
        };

        if (batch instanceof Promise) {
            this.pendingAsyncSends++;
            try {
                await this.chain(async () => {
                    try {
                        const encoded = await batch;
                        frame(encoded.content);
                    } catch (error: unknown) {
                        for (const { packet } of queued) this.logPacketEncodeFailure(packet, error);
                        for (const { resolve } of queued) resolve();
                    }
                });
            } finally {
                this.pendingAsyncSends--;
            }
            return;
        }

        await this.ordered(() => frame(batch.content));
    }

    private enqueuePacket(packet: NetworkPacket<unknown>, options: PacketBatchOptions, direct: boolean): QueuedPacket {
        const encoded = encodePacketsForCodec([packet], this.codec);
        const prepared = encoded.packets[0];
        const buffer = encoded.buffers[0];
        if (prepared === undefined || buffer === undefined) throw new Error('Packet encoding returned no bytes');
        if (
            this.queuedPackets.length > 0 &&
            (this.queuedBatchOptions === undefined ||
                !sameBatchOptions(this.queuedBatchOptions, options) ||
                this.queuedPacketBytes + buffer.byteLength > OUTBOUND_QUEUE_BYTE_LIMIT)
        ) {
            void this.flushOutboundPackets().catch((error: unknown) => this.logger.error(error));
        }
        const queued = this.enqueuePreparedPacket(prepared, buffer, options, direct);
        if (this.queuedPacketBytes >= OUTBOUND_QUEUE_BYTE_LIMIT) {
            void this.flushOutboundPackets().catch((error: unknown) => this.logger.error(error));
        } else this.scheduleOutboundFlush();
        return queued;
    }

    private enqueuePreparedPacket(
        packet: NetworkPacket<unknown>,
        buffer: Buffer,
        options: PacketBatchOptions,
        direct: boolean
    ): QueuedPacket {
        if (
            this.queuedPackets.length > 0 &&
            this.queuedBatchOptions !== undefined &&
            !sameBatchOptions(this.queuedBatchOptions, options)
        ) {
            // The caller has already reserved this packet's place by flushing the prior queue.
            // A mismatch here means a concurrent send crossed that boundary, so fail loudly
            // rather than put packets with different wire compression formats together.
            throw new Error('Outbound packet compression changed while a queue flush was pending');
        }
        let resolve = (): void => {};
        let reject = (_error: unknown): void => {};
        const done = new Promise<void>((finish, fail) => {
            resolve = finish;
            reject = fail;
        });
        const queued: QueuedPacket = { packet, buffer, options, direct, resolve, reject, done };
        this.queuedPackets.push(queued);
        this.queuedPacketBytes += buffer.byteLength;
        this.queuedBatchOptions = options;
        return queued;
    }

    private scheduleOutboundFlush(): void {
        if (this.flushScheduled) return;
        this.flushScheduled = true;
        setImmediate(() => {
            this.flushScheduled = false;
            void this.flushOutboundPackets().catch((error: unknown) => this.logger.error(error));
        });
    }

    /**
     * Whether `JSP_DEBUG_DROP_PACKETS` names this packet. A dropped packet leaves a warn line,
     * so the log of a bisect run says what the client did not get.
     * @param {string} name - The packet class name.
     * @returns {boolean} `true` when the packet must not be sent.
     */
    private drops(name: string): boolean {
        if (!this.dropped.has(name)) return false;

        this.logger.warn(`Dropped §b${name}§r packet, named by JSP_DEBUG_DROP_PACKETS`);
        return true;
    }

    /**
     * Writes an encoded packet to a file when `JSP_DEBUG_DUMP_PACKETS` names it.
     *
     * One file per packet, `<millis>-<address>-<name>.bin`, holding the packet with its header
     * and before batching and compression. A write failure is logged and otherwise ignored;
     * a debugging aid must not take the connection down with it.
     * @param packet - An encoded packet.
     * @param encodedBuffer - The buffer captured when this packet was prepared, if it was queued.
     */
    private dump(packet: NetworkPacket<unknown>, encodedBuffer?: Buffer): void {
        const name = packet.getName();
        if (!this.dumped.has(name)) return;

        // Shared batches may carry packet labels without the packet streams being prepared.
        const buffer = encodedBuffer ?? packet.getBuffer();
        const file = path.join(this.dumpDir, `${Date.now()}-connection-${this.connection.id}-${name}.bin`);
        try {
            fs.mkdirSync(this.dumpDir, { recursive: true });
            fs.writeFileSync(file, buffer);
            this.logger.warn(`Dumped §b${name}§r packet (${buffer.byteLength} bytes) to ${file}`);
        } catch (error: unknown) {
            this.logger.warn(`Could not dump §b${name}§r packet to ${file}: ${String(error)}`);
        }
    }

    /**
     * A batch is dropped whole when any packet in it is named.
     * @param packets - The packets about to be encoded.
     * @returns {boolean} `true` when the batch must not be sent.
     */
    private dropsPackets(packets: readonly NetworkPacket<unknown>[]): boolean {
        let drop = false;
        for (const packet of packets) {
            if (this.drops(packet.getName())) drop = true;
        }

        return drop;
    }

    public forceDisconnect(): void {
        this.connection.close();
    }

    private frameEncodedDataPacket(batch: ReturnType<typeof encodePacketBatch>, direct: boolean): void {
        const encodedPacket = batch.packets[0]!;

        // After encoding, so a dumped packet is the bytes the client would have been given,
        // whether or not it is also dropped.
        this.dump(encodedPacket, batch.packetBuffers[0]);
        if (this.drops(encodedPacket.getName())) return;

        this.frameAndRecord(batch.content, batch.packets, direct, batch.packetBuffers);
        if (this.logger.isEnabled('silly') && this.logFilter.shouldLog(encodedPacket)) {
            this.logger.silly(`Sent §b${encodedPacket.getName()}§r packet`);
        }
    }
    private logPacketEncodeFailure(packet: NetworkPacket<unknown>, error: unknown): void {
        this.logger.error(error);
        this.logger.warn(
            `Packet §b${packet.getName()}§r to §b${this.connection.address}§r failed with: ${error instanceof Error ? error.message : String(error)}`
        );
    }

    /**
     * Applies the server's current compression settings unless a caller chose them for this
     * batch. Most packet paths do not know about server configuration; resolving them here
     * keeps ordinary sends, including queued movement, consistent with shared batches.
     */
    private withCompressionOptions(options: PacketBatchOptions): PacketBatchOptions {
        return {
            ...options,
            ...(options.compressionLevel === undefined && this.getCompressionLevel !== undefined
                ? { compressionLevel: this.getCompressionLevel() }
                : {}),
            ...(options.compressionThreshold === undefined && this.getCompressionThreshold !== undefined
                ? { compressionThreshold: this.getCompressionThreshold() }
                : {})
        };
    }
}

/**
 * Fans one packet out as shared batches, compressed once per protocol codec.
 *
 * The shared-batch win - one deflate serving every recipient - used to be one global batch,
 * which handed a 2225 session the 2193 layout for any packet whose wire changed between
 * them. Sessions are grouped by codec and each group gets bytes encoded under its own: the
 * single compression survives within a group, and a mixed-version audience each receives its
 * negotiated layout. A group whose encode fails is logged and skipped; the others still send.
 * @param {readonly MinecraftSession[]} sessions - Who receives it.
 * @param packets - The packets, as the caller built them.
 * @param {number} compressionLevel - The batch compression level.
 * @param {(error: unknown) => void} onError - Where an encode failure goes.
 * @param compressionThreshold - Optional override for the minimum batch-body size to compress.
 */
export const broadcastSharedBatches = (
    sessions: readonly MinecraftSession[],
    packets: NetworkPacket<unknown> | readonly NetworkPacket<unknown>[],
    compressionLevel: number,
    onError: (error: unknown) => void,
    compressionThreshold?: number,
    fragmentOptions: Pick<PacketBatchOptions, 'fullFlushFragments' | 'fragmentCache'> = {}
): Promise<void> => {
    const packetList = packets instanceof Array ? packets : [packets];
    const sends: Promise<void>[] = [];
    const groups: {
        codec: ProtocolCodec;
        algorithm: PacketCompressionAlgorithm;
        threshold: number;
        sessions: MinecraftSession[];
    }[] = [];
    for (const session of sessions) {
        const group = groups.find(
            (candidate) =>
                candidate.codec === session.codec &&
                candidate.algorithm === session.compressionAlgorithm &&
                candidate.threshold === (compressionThreshold ?? session.compressionThreshold)
        );
        if (group === undefined) {
            groups.push({
                codec: session.codec,
                algorithm: session.compressionAlgorithm,
                threshold: compressionThreshold ?? session.compressionThreshold,
                sessions: [session]
            });
        } else group.sessions.push(session);
    }

    for (const { codec, algorithm, threshold, sessions: group } of groups) {
        try {
            const batch = encodePacketBatchBySize(packetList, codec, {
                compressionLevel,
                compressionAlgorithm: algorithm,
                compressionThreshold: threshold,
                ...fragmentOptions,
                fragmentCodec: codec
            });
            if (batch instanceof Promise) {
                const failedPacket = packetList[0];
                if (failedPacket === undefined) throw new Error('A large shared batch has no packet to report');
                for (const session of group) sends.push(session.sendSharedBatchAsync(batch, failedPacket));
            } else {
                for (const session of group) {
                    sends.push(session.sendSharedBatch(batch.content, batch.packets, false, batch.packetBuffers));
                }
            }
        } catch (error: unknown) {
            onError(error);
        }
    }

    return Promise.all(sends).then(
        () => undefined,
        (error: unknown) => {
            onError(error);
        }
    );
};

/** Options for a session to frame packets as one batch. */
interface PacketBatchSendOptions extends PacketBatchOptions {
    /** Whether RakNet should send the framed bytes in their own datagram. */
    direct?: boolean;
}
