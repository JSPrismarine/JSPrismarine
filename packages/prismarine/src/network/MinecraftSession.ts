import type { Logger } from '@jsprismarine/logger';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import HandshakeCodec from './codec/HandshakeCodec';
import type { ProtocolCodec } from './codec/ProtocolCodec';
import type { TransportConnection } from './transport/Transport';
import { BatchPacket } from './Packets';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PacketLogFilter } from './PacketLogFilter';

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

/**
 * The layer between a `ClientConnection` and its transport: wraps single packets in a
 * batch of their own, frames encoded batches in the order they were asked for, and logs what
 * went out.
 *
 * Whether a batch is compressed is the caller's decision, taken from the connection's
 * negotiated state. `RequestNetworkSettingsHandler` sends `NetworkSettings` uncompressed
 * and flips `ClientConnection.hasCompression` at the same time, so the next packet in either
 * direction is the first one with an algorithm prefix. Nothing is encrypted: the server never
 * sends `ServerToClientHandshake`, and a client accepts a plaintext session when no handshake
 * arrives - and the transport's own `capabilities.encrypted` says whether the wire covers it.
 */
export default class MinecraftSession {
    /**
     * The protocol codec this session speaks. Every session starts on the layout-stable
     * handshake codec, which knows only the packets a connection may exchange before a
     * version is agreed; `RequestNetworkSettingsHandler` reassigns it from the codec
     * registry once the client announces its protocol version.
     */
    public codec: ProtocolCodec = HandshakeCodec;

    protected readonly connection: TransportConnection;

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
     * finished. The counter keeps that from costing anything in the ordinary case: with no
     * asynchronous send outstanding there is nothing to get behind, and a packet frames
     * immediately as it always did.
     */
    private outbound: Promise<void> = Promise.resolve();
    private pendingAsyncSends = 0;

    public constructor(
        connection: TransportConnection,
        private readonly logger: Logger,
        private readonly logFilter: PacketLogFilter = new PacketLogFilter(),
        private readonly dropped: ReadonlySet<string> = debugPacketNames(process.env.JSP_DEBUG_DROP_PACKETS),
        private readonly dumped: ReadonlySet<string> = debugPacketNames(process.env.JSP_DEBUG_DUMP_PACKETS),
        private readonly dumpDir: string = defaultDumpDir()
    ) {
        this.connection = connection;
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

    public sendBatch(batch: BatchPacket, direct = true): void {
        if (this.dropsBatch(batch)) return;

        batch.codec = this.codec;
        batch.encode();
        void this.ordered(() => this.frameBatch(batch, direct));
    }

    /**
     * The same, with the compression handed to zlib's asynchronous API.
     *
     * Node runs that on the libuv thread pool, so the work leaves the main thread instead of
     * merely being deferred on it. Worth the extra await for chunk batches, which are the
     * large and frequent ones; everything else stays on {@link sendBatch}, where a trip
     * through the pool would cost more than compressing a small packet does.
     */
    public async sendBatchAsync(batch: BatchPacket, direct = true): Promise<void> {
        if (this.dropsBatch(batch)) return;

        this.pendingAsyncSends++;
        try {
            await this.chain(async () => {
                batch.codec = this.codec;
                await batch.encodeAsync();
                this.frameBatch(batch, direct);

                // One line per packet, as `sendDataPacket` writes, so a join trace shows the
                // chunks between the publisher updates instead of a gap where they went out.
                for (const name of batch.getPacketNames()) {
                    if (this.logFilter.shouldLogName(name)) this.logger.silly(`Sent §b${name}§r packet`);
                }
            });
        } finally {
            this.pendingAsyncSends--;
        }
    }

    /**
     * Frames a batch somebody else has already encoded.
     *
     * The counterpart to {@link sendBatch}, which encodes what it is handed. This takes the
     * finished bytes, so one compression can serve every recipient of a broadcast - the same
     * `UpdateBlockPacket` going to twenty players was twenty deflates of identical bytes.
     *
     * It must never be given a batch that has not been encoded; there is nothing here that
     * would notice. A separate entry point rather than a flag on `sendBatch` precisely because
     * `sendBatch` calls `encode()` unconditionally and packet encoding begins by clearing
     * the buffer - reusing it for a fan-out would recompress per recipient *and* invalidate
     * the bytes already handed out.
     * @param {Buffer} content - The encoded, compressed batch.
     * @param packet - What is inside it, for the traffic log only.
     * @param {boolean} [direct=false] - Force a datagram of its own.
     */
    public sendSharedBatch(content: Buffer, packet: NetworkPacket<unknown>, direct = false): void {
        this.dump(packet);
        if (this.drops(packet.getName())) return;

        // Through the same ordering chain as everything else, so a shared batch cannot
        // overtake a chunk batch that is still compressing.
        void this.ordered(() => {
            this.frame(content, direct);
            if (this.logFilter.shouldLog(packet)) this.logger.silly(`Sent §b${packet.getName()}§r packet`);
        });
    }

    private frameBatch(batch: BatchPacket, direct: boolean): void {
        this.frame(batch.getBuffer(), direct);
    }

    private frame(content: Buffer, direct: boolean): void {
        this.connection.sendFrame(content, direct);
    }

    public async sendDataPacket(packet: NetworkPacket<unknown>, comp = true, direct = false): Promise<void> {
        // The session's codec owns the wire: a packet built directly would otherwise encode
        // the 2193 layout under the 2193 id whatever this session negotiated. The codec swaps
        // in its own class when the layout changed, and stamps the id either way.
        packet = this.codec.prepareOutbound(packet);
        const netId = this.codec.netIdOf(packet.getName());
        if (netId !== undefined) packet.setNetId(netId);

        const batch = new BatchPacket();
        try {
            batch.addPacket(packet);
            batch.compressed = comp;
            batch.encode();
        } catch (error: unknown) {
            this.logger.error(error);
            this.logger.warn(
                `Packet §b${packet.getName()}§r to §b${this.connection.token}§r failed with: ${error instanceof Error ? error.message : String(error)}`
            );
            return;
        }

        // After encoding, so a dumped packet is the bytes the client would have been given,
        // whether or not it is also dropped.
        this.dump(packet);
        if (this.drops(packet.getName())) return;

        // Behind any chunk batch still compressing, so this packet does not overtake terrain
        // it was meant to follow.
        await this.ordered(() => {
            this.frameBatch(batch, direct);
            if (this.logFilter.shouldLog(packet)) this.logger.silly(`Sent §b${packet.getName()}§r packet`);
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
     */
    private dump(packet: NetworkPacket<unknown>): void {
        const name = packet.getName();
        if (!this.dumped.has(name)) return;

        const address = this.connection.token.replaceAll(':', '-');
        const file = path.join(this.dumpDir, `${Date.now()}-${address}-${name}.bin`);
        try {
            fs.mkdirSync(this.dumpDir, { recursive: true });
            fs.writeFileSync(file, packet.getBuffer());
            this.logger.warn(`Dumped §b${name}§r packet (${packet.getBuffer().byteLength} bytes) to ${file}`);
        } catch (error: unknown) {
            this.logger.warn(`Could not dump §b${name}§r packet to ${file}: ${String(error)}`);
        }
    }

    /**
     * A batch is dropped whole when any packet in it is named. Chunk batches hold only
     * `LevelChunkPacket`s, so for the join stream this costs nothing extra.
     * @param {BatchPacket} batch - The batch about to be encoded.
     * @returns {boolean} `true` when the batch must not be sent.
     */
    private dropsBatch(batch: BatchPacket): boolean {
        let drop = false;
        for (const name of batch.getPacketNames()) {
            if (this.drops(name)) drop = true;
        }

        return drop;
    }

    public forceDisconnect(): void {
        this.connection.close();
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
 * @param packet - The packet, as the caller built it.
 * @param {number} compressionLevel - The batch compression level.
 * @param {(error: unknown) => void} onError - Where an encode failure goes.
 */
export const broadcastSharedBatches = (
    sessions: readonly MinecraftSession[],
    packet: NetworkPacket<unknown>,
    compressionLevel: number,
    onError: (error: unknown) => void
): void => {
    const byCodec = new Map<ProtocolCodec, MinecraftSession[]>();
    for (const session of sessions) {
        const group = byCodec.get(session.codec);
        if (group === undefined) byCodec.set(session.codec, [session]);
        else group.push(session);
    }

    for (const [codec, group] of byCodec) {
        const batch = new BatchPacket();
        batch.codec = codec;
        batch.compressionLevel = compressionLevel;
        try {
            batch.addPacket(packet);
            batch.encode();
        } catch (error: unknown) {
            onError(error);
            continue;
        }

        const content = batch.getBuffer();
        for (const session of group) session.sendSharedBatch(content, packet);
    }
};
