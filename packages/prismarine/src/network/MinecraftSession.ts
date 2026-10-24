import type { Logger } from '@jsprismarine/logger';
import type { RakNetSession } from '@jsprismarine/raknet';
import { ConnectionPriority, Protocol } from '@jsprismarine/raknet';
import type { DataPacket } from './Packets';
import { BatchPacket } from './Packets';
import { PacketLogFilter } from './PacketLogFilter';

/**
 * The clientbound packets `JSP_DEBUG_DROP_PACKETS` names, by class name.
 *
 * A debugging aid for a client that leaves during the join without saying why. Set the
 * variable to a comma-separated list such as `LevelChunkPacket,CraftingDataPacket` and the
 * named packets never reach the wire, which bisects the join stream one packet type at a
 * time against a real client. Read when a session is created, from the environment the
 * server was started with.
 * @param {string | undefined} [value] - The variable's value; defaults to the process environment.
 * @returns {ReadonlySet<string>} The names to drop, empty when the variable is unset.
 */
export const debugDroppedPackets = (value = process.env.JSP_DEBUG_DROP_PACKETS): ReadonlySet<string> =>
    new Set(
        (value ?? '')
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name.length > 0)
    );

/**
 * The layer between a `ClientConnection` and its RakNet session: wraps single packets in a
 * batch of their own, frames encoded batches in the order they were asked for, and logs what
 * went out.
 *
 * Whether a batch is compressed is the caller's decision, taken from the connection's
 * negotiated state. `RequestNetworkSettingsHandler` sends `NetworkSettings` uncompressed
 * and flips `ClientConnection.hasCompression` at the same time, so the next packet in either
 * direction is the first one with an algorithm prefix. Nothing is encrypted: the server never
 * sends `ServerToClientHandshake`, and a client accepts a plaintext session when no handshake
 * arrives.
 */
export default class MinecraftSession {
    protected readonly rakSession: RakNetSession;

    /**
     * Tail of the outbound chain, and how many asynchronous sends have not framed yet.
     *
     * RakNet stamps a message's order index inside `sendFrame`, which is to say at the
     * moment it is framed and not at the moment it was asked for. Everything here goes out
     * reliable ordered on channel 0, so that stamp *is* the order the client applies things
     * in. A chunk batch that stops to compress used to let anything sent meanwhile jump in
     * front of it: send a LevelChunk, break a block while zlib is still working, and the
     * UpdateBlock took the lower index - the client applied the break, then laid the older
     * chunk snapshot over the top of it and the block came back. Two chunk batches could
     * likewise finish compressing in the opposite order to the one they were queued in.
     *
     * So framing follows the order the sends were requested, not the order the work
     * finished. The counter keeps that from costing anything in the ordinary case: with no
     * asynchronous send outstanding there is nothing to get behind, and a packet frames
     * immediately as it always did.
     */
    private outbound: Promise<void> = Promise.resolve();
    private pendingAsyncSends = 0;

    public constructor(
        session: RakNetSession,
        private readonly logger: Logger,
        private readonly logFilter: PacketLogFilter = new PacketLogFilter(),
        private readonly dropped: ReadonlySet<string> = debugDroppedPackets()
    ) {
        this.rakSession = session;
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
     * `sendBatch` calls `encode()` unconditionally and `DataPacket.encode` begins by clearing
     * the buffer - reusing it for a fan-out would recompress per recipient *and* invalidate
     * the bytes already handed out.
     * @param {Buffer} content - The encoded, compressed batch.
     * @param {DataPacket} packet - What is inside it, for the traffic log only.
     * @param {boolean} [direct=false] - Force a datagram of its own.
     */
    public sendSharedBatch(content: Buffer, packet: DataPacket, direct = false): void {
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
        const sendPacket = new Protocol.Frame();
        sendPacket.reliability = Protocol.FrameReliability.RELIABLE_ORDERED;
        sendPacket.orderChannel = 0;
        sendPacket.content = content;

        this.rakSession.sendFrame(sendPacket, direct ? ConnectionPriority.IMMEDIATE : ConnectionPriority.NORMAL);
    }

    public async sendDataPacket(packet: DataPacket, comp = true, direct = false): Promise<void> {
        if (this.drops(packet.getName())) return;

        const batch = new BatchPacket();
        try {
            batch.addPacket(packet);
            batch.compressed = comp;
            batch.encode();
        } catch (error: unknown) {
            this.logger.error(error);
            this.logger.warn(
                `Packet §b${packet.getName()}§r to §b${this.rakSession
                    .getAddress()
                    .toToken()}§r failed with: ${error instanceof Error ? error.message : String(error)}`
            );
            return;
        }

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
        this.rakSession.disconnect();
    }
}
