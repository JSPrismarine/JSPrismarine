import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import type { RemoteInfo } from 'node:dgram';
import type Packet from './protocol/Packet';
import Frame from './protocol/Frame';
import RakNetSession, { RakNetPriority, RakNetRole, SessionStatus } from './Session';
import type { Logger, RakNetListenerLike } from './RakNetPeer';
import SharedByteRing from './SharedByteRing';
import InetAddress from './utils/InetAddress';
import type { ServerName, ServerNameSnapshot } from './utils/ServerName';
import { validateSocketBufferOptions } from './SocketBuffers';
import type { SocketBufferOptions } from './SocketBuffers';
import { UDP_HEADER_SIZE } from './Constants';

const DEFAULT_RING_CAPACITY = 8 * 1024 * 1024;
const MAX_RECORDS_PER_TICK = 4096;
const METRIC_COUNT = 3;
const EVENT_CONNECTED = 1;
const EVENT_FRAME = 2;
const EVENT_CLOSED = 3;
const EVENT_RAW = 4;
const COMMAND_FRAME = 1;
const COMMAND_DISCONNECT = 2;
const COMMAND_DISCONNECT_IMMEDIATE = 3;
const COMMAND_RAW = 4;
const CONNECTED_PAYLOAD_BYTES = 10;
const EVENT_HEADER_BYTES = 9;

interface WorkerServerOptions {
    readonly address: string;
    readonly port: number;
    readonly maxConnections: number;
    readonly serverGuid: string;
    readonly name: ServerNameSnapshot;
    readonly socketBufferOptions: SocketBufferOptions;
    readonly outboundMemory: SharedArrayBuffer;
    readonly inboundMemory: SharedArrayBuffer;
    readonly metricsMemory: SharedArrayBuffer;
    readonly ringCapacity: number;
}

/** Raised when the bounded main-to-worker ring has no room for a complete message. */
export class RakNetBackpressureError extends Error {
    public constructor(queuedBytes: number, capacity: number) {
        super(`RakNet worker queue is full (${queuedBytes}/${capacity} bytes queued)`);
        this.name = 'RakNetBackpressureError';
    }
}

/**
 * A server RakNet peer whose UDP socket, session reliability, and timers live in one worker.
 * Frames cross the thread boundary through bounded shared-memory rings and are delivered to
 * listeners only when {@link pollInbound} is called at the start of a game tick.
 */
export default class WorkerServerSocket extends EventEmitter implements RakNetListenerLike {
    private readonly outbound: SharedByteRing;
    private readonly inbound: SharedByteRing;
    private readonly metricsMemory: SharedArrayBuffer;
    private readonly metrics: Int32Array;
    private readonly guid: bigint;
    private readonly sessionsById = new Map<number, WorkerSessionProxy>();
    private readonly sessionIdsByAddress = new Map<string, number>();
    private readonly unsubscribeNameChanges: () => void;
    private worker: Worker | undefined;
    private maxConnections: number;
    private stopped = false;
    private readyPromise: Promise<void> | undefined;
    private resolveReady: (() => void) | undefined;
    private rejectReady: ((error: Error) => void) | undefined;

    /**
     * @param maxConnections - Maximum concurrent RakNet sessions.
     * @param _onlineMode - Accepted for compatibility; RakNet has no online-mode branch.
     * @param serverName - The main-thread server-list state mirrored to the worker.
     * @param logger - Receives the worker's RakNet log messages.
     * @param socketBufferOptions - UDP socket buffers requested by the worker.
     * @param ringCapacity - Byte capacity of each bounded shared-memory ring.
     */
    public constructor(
        maxConnections: number,
        _onlineMode: boolean,
        public readonly serverName: ServerName,
        private readonly logger: Logger,
        private readonly socketBufferOptions: SocketBufferOptions = {},
        private readonly ringCapacity = DEFAULT_RING_CAPACITY
    ) {
        super();
        validateSocketBufferOptions(socketBufferOptions);
        this.maxConnections = maxConnections;
        this.outbound = new SharedByteRing(ringCapacity);
        this.inbound = new SharedByteRing(ringCapacity);
        this.metricsMemory = new SharedArrayBuffer(METRIC_COUNT * Int32Array.BYTES_PER_ELEMENT);
        this.metrics = new Int32Array(this.metricsMemory);

        this.guid = this.createGuid();
        this.serverName.setServerId(this.guid);
        this.unsubscribeNameChanges = this.serverName.onChange((snapshot) => {
            try {
                this.worker?.postMessage({ type: 'server-name', snapshot });
            } catch (error: unknown) {
                this.logger.error(error, 'RakNet/WorkerServerSocket/serverName');
            }
        });
    }

    /** Starts the worker and binds its UDP socket. */
    public start(address: string, port: number): void {
        if (this.worker) throw new Error('Worker RakNet socket has already been started');
        if (this.stopped) throw new Error('Cannot start a stopped Worker RakNet socket');

        this.readyPromise = new Promise<void>((resolve, reject) => {
            this.resolveReady = resolve;
            this.rejectReady = reject;
        });

        const sourceWorker = import.meta.url.endsWith('.ts');
        const workerUrl = new URL(
            sourceWorker ? './WorkerServerSocket.worker.ts' : './WorkerServerSocket.worker.js',
            import.meta.url
        );
        // `--input-type` is valid for the parent when it runs `-e` or stdin, but Node
        // rejects it for a worker that loads a file. Keep the other runtime flags intact.
        const workerExecArgv = process.execArgv.filter((argument) => !argument.startsWith('--input-type'));
        // Resolve the source-only loader from this package. A bare `tsx` specifier is resolved
        // from the process entry point, which may be the monorepo root without that dependency.
        const tsxLoader = sourceWorker ? import.meta.resolve('tsx') : undefined;
        const execArgv =
            tsxLoader !== undefined && !workerExecArgv.some((argument) => argument === 'tsx' || argument === tsxLoader)
                ? [...workerExecArgv, '--import', tsxLoader]
                : workerExecArgv;
        const options: WorkerServerOptions = {
            address,
            port,
            maxConnections: this.maxConnections,
            serverGuid: this.guid.toString(),
            name: this.serverName.getSnapshot(),
            socketBufferOptions: this.socketBufferOptions,
            outboundMemory: this.outbound.memory,
            inboundMemory: this.inbound.memory,
            metricsMemory: this.metricsMemory,
            ringCapacity: this.ringCapacity
        };

        const worker = new Worker(workerUrl, { workerData: options, execArgv });
        this.worker = worker;
        worker.on('message', (message: unknown) => this.handleWorkerMessage(message));
        worker.on('error', (error: Error) => this.handleWorkerFailure(error));
        worker.on('exit', (code: number) => {
            if (!this.stopped) this.handleWorkerFailure(new Error(`RakNet worker exited with code ${code}`));
        });
    }

    /** Resolves when the worker has bound the UDP socket. */
    public waitUntilReady(): Promise<void> {
        if (!this.readyPromise) return Promise.reject(new Error('Worker RakNet socket has not been started'));
        return this.readyPromise;
    }

    /**
     * Delivers up to {@link MAX_RECORDS_PER_TICK} worker events in their shared-ring order.
     * @returns The number of events delivered.
     */
    public pollInbound(): number {
        let delivered = 0;
        while (delivered < MAX_RECORDS_PER_TICK) {
            const record = this.inbound.tryRead();
            if (record === null) break;
            this.deliverRecord(record);
            delivered++;
        }
        return delivered;
    }

    /** Stops accepting traffic and asks the worker to close its socket. */
    public kill(): void {
        if (this.stopped) return;
        this.stopped = true;
        this.unsubscribeNameChanges();
        this.worker?.postMessage({ type: 'stop' });
        for (const session of this.sessionsById.values()) {
            session.markClosed();
            // The game ticker stops before server shutdown reaches the listener. Emit the
            // same close event the socket backend emits so the session manager can tear down.
            this.emit('closeConnection', session.getAddress(), 'server closed');
        }
        this.sessionsById.clear();
        this.sessionIdsByAddress.clear();
        this.serverName.setOnlinePlayerCount(0);
    }

    /** Whether the main-thread view has room for another completed connection. */
    public allowIncomingConnections(): boolean {
        return this.sessionsById.size < this.maxConnections;
    }

    /** Returns the connection limit. */
    public getMaxConnections(): number {
        return this.maxConnections;
    }

    /** Changes the worker's connection limit. */
    public setMaxConnections(allowed: number): void {
        this.maxConnections = allowed;
        this.worker?.postMessage({ type: 'max-connections', value: allowed });
    }

    /** Sessions whose connected handshake has reached the game-thread handoff point. */
    public getSessions(): RakNetSession[] {
        return [...this.sessionsById.values()];
    }

    /** Finds a completed session by remote address. */
    public getSessionByAddress(rinfo: RemoteInfo): RakNetSession | null {
        const id = this.sessionIdsByAddress.get(`${rinfo.address}:${rinfo.port}`);
        return id === undefined ? null : (this.sessionsById.get(id) ?? null);
    }

    /** Finds a completed session by client GUID. */
    public getSessionByGUID(guid: bigint): RakNetSession | null {
        for (const session of this.sessionsById.values()) {
            if (session.guid === guid) return session;
        }
        return null;
    }

    /** The GUID used in unconnected replies. */
    public getServerGuid(): bigint {
        return this.guid;
    }

    /** The logger also satisfies the RakNet peer used by proxy sessions. */
    public getLogger(): Logger {
        return this.logger;
    }

    /**
     * Sends a raw RakNet packet through the worker's socket.
     * @param packet - The packet to encode.
     * @param rinfo - The remote address.
     */
    public sendPacket<T extends Packet>(packet: T, rinfo: RemoteInfo): void {
        packet.encode();
        this.sendBuffer(packet.getBuffer(), rinfo);
    }

    /** Sends a raw UDP datagram through the worker's socket. */
    public sendBuffer(buffer: Buffer, rinfo: RemoteInfo): void {
        const address = Buffer.from(rinfo.address);
        const header = Buffer.allocUnsafe(EVENT_HEADER_BYTES);
        header[0] = COMMAND_RAW;
        header.writeUInt32LE(0, 1);
        header.writeUInt16LE(rinfo.port, 5);
        header.writeUInt16LE(address.byteLength, 7);
        this.writeCommand([header, address, buffer]);
    }

    /** Removes a main-thread proxy when its owning application explicitly asks. */
    public removeSession(session: RakNetSession, reason?: string): void {
        for (const [id, candidate] of this.sessionsById) {
            if (candidate !== session) continue;
            this.queueDisconnect(id, reason ?? 'closed by application', true);
            candidate.markClosed();
            return;
        }
    }

    /** Queue and reliability measurements shared by the worker. */
    public getMetrics(): {
        inbound: ReturnType<SharedByteRing['getMetrics']>;
        outbound: ReturnType<SharedByteRing['getMetrics']>;
        retransmissions: number;
        roundTripSamples: number;
        maxRoundTripMs: number;
    } {
        return {
            inbound: this.inbound.getMetrics(),
            outbound: this.outbound.getMetrics(),
            retransmissions: Atomics.load(this.metrics, 1),
            roundTripSamples: Atomics.load(this.metrics, 2),
            maxRoundTripMs: Atomics.load(this.metrics, 0) / 1000
        };
    }

    /** CPU time consumed by the network worker since it started. */
    public async getWorkerCpuUsage(): Promise<NodeJS.CpuUsage> {
        if (!this.worker) return { user: 0, system: 0 };
        return this.worker.cpuUsage();
    }

    /** Adds an outgoing frame command without blocking the game thread. */
    public queueFrame(sessionId: number, frame: Frame, priority: RakNetPriority): void {
        const header = Buffer.allocUnsafe(8);
        header[0] = COMMAND_FRAME;
        header.writeUInt32LE(sessionId, 1);
        header[5] = frame.reliability;
        header[6] = frame.orderChannel;
        header[7] = priority;
        this.writeCommand([header, frame.content]);
    }

    /** Sends a disconnect request to the worker in session order. */
    public queueDisconnect(sessionId: number, reason: string, immediate: boolean): void {
        const reasonBytes = Buffer.from(reason);
        const header = Buffer.allocUnsafe(7);
        header[0] = immediate ? COMMAND_DISCONNECT_IMMEDIATE : COMMAND_DISCONNECT;
        header.writeUInt32LE(sessionId, 1);
        header.writeUInt16LE(reasonBytes.byteLength, 5);
        this.writeCommand([header, reasonBytes]);
    }

    private createGuid(): bigint {
        let guid = randomBytes(8).readBigUInt64BE();
        while (guid === 0n) guid = randomBytes(8).readBigUInt64BE();
        return guid;
    }

    private writeCommand(parts: readonly Uint8Array[]): void {
        if (this.stopped) throw new Error('Cannot send through a stopped RakNet worker');
        if (!this.outbound.tryWriteParts(parts)) {
            const metrics = this.outbound.getMetrics();
            throw new RakNetBackpressureError(metrics.queuedBytes, metrics.capacity);
        }
    }

    private handleWorkerMessage(message: unknown): void {
        if (typeof message !== 'object' || message === null || !('type' in message)) return;
        if (typeof message.type !== 'string') return;

        if (message.type === 'ready' && 'port' in message && typeof message.port === 'number') {
            this.serverName.setPort(message.port);
            this.resolveReady?.();
            this.resolveReady = undefined;
            this.rejectReady = undefined;
            this.emit('listening', message.port);
            return;
        }

        if (message.type === 'log' && 'level' in message && 'text' in message) {
            this.forwardLog(message.level, message.text);
            return;
        }

        if (message.type === 'failure' && 'text' in message && typeof message.text === 'string') {
            this.handleWorkerFailure(new Error(message.text));
        }
    }

    private forwardLog(level: unknown, text: unknown): void {
        if (typeof text !== 'string') return;
        switch (level) {
            case 'info':
                this.logger.info(text, 'RakNet/Worker');
                break;
            case 'warn':
                this.logger.warn(text, 'RakNet/Worker');
                break;
            case 'error':
                this.logger.error(text, 'RakNet/Worker');
                break;
            case 'verbose':
                this.logger.verbose(text, 'RakNet/Worker');
                break;
            case 'debug':
                this.logger.debug(text, 'RakNet/Worker');
                break;
            case 'silly':
                this.logger.silly(text, 'RakNet/Worker');
                break;
        }
    }

    private handleWorkerFailure(error: Error): void {
        this.rejectReady?.(error);
        this.resolveReady = undefined;
        this.rejectReady = undefined;
        this.logger.error(error, 'RakNet/WorkerServerSocket');
        for (const session of this.sessionsById.values()) {
            session.markClosed();
            this.emit('closeConnection', session.getAddress(), 'network worker failed');
        }
        this.sessionsById.clear();
        this.sessionIdsByAddress.clear();
        this.unsubscribeNameChanges();
        this.serverName.setOnlinePlayerCount(0);
        this.stopped = true;
    }

    private deliverRecord(record: Buffer): void {
        if (record.byteLength < EVENT_HEADER_BYTES) return;
        const type = record[0]!;
        const id = record.readUInt32LE(1);
        const port = record.readUInt16LE(5);
        const addressLength = record.readUInt16LE(7);
        const payloadOffset = EVENT_HEADER_BYTES + addressLength;
        if (payloadOffset > record.byteLength) return;
        const address = record.toString('utf8', EVENT_HEADER_BYTES, payloadOffset);
        const payload = record.subarray(payloadOffset);

        if (type === EVENT_CONNECTED) {
            if (payload.byteLength !== CONNECTED_PAYLOAD_BYTES) return;
            const rinfo: RemoteInfo = { address, port, family: 'IPv4', size: 0 };
            const mtuSize = payload.readUInt16LE(0) + UDP_HEADER_SIZE;
            const guid = payload.readBigUInt64LE(2);
            const session = new WorkerSessionProxy(this, id, mtuSize, rinfo, guid);
            this.sessionsById.set(id, session);
            this.sessionIdsByAddress.set(session.getAddress().toToken(), id);
            this.serverName.setOnlinePlayerCount(this.sessionsById.size);
            this.emit('openConnection', session);
            return;
        }

        if (type === EVENT_FRAME) {
            const session = this.sessionsById.get(id);
            if (!session) return;
            const frame = new Frame();
            frame.content = payload;
            this.emit('encapsulated', frame, session.getAddress());
            return;
        }

        if (type === EVENT_CLOSED) {
            const session = this.sessionsById.get(id);
            if (!session) return;
            session.markClosed();
            this.sessionsById.delete(id);
            this.sessionIdsByAddress.delete(session.getAddress().toToken());
            this.serverName.setOnlinePlayerCount(this.sessionsById.size);
            this.emit('closeConnection', session.getAddress(), payload.toString('utf8') || 'closed');
            return;
        }

        if (type === EVENT_RAW) this.emit('raw', payload, new InetAddress(address, port));
    }
}

/** Main-thread view of a session; reliability state remains exclusively in the worker. */
class WorkerSessionProxy extends RakNetSession {
    private closed = false;

    public constructor(
        private readonly owner: WorkerServerSocket,
        private readonly sessionId: number,
        mtuSize: number,
        rinfo: RemoteInfo,
        guid: bigint
    ) {
        super(owner, mtuSize, rinfo, guid, RakNetRole.SERVER);
    }

    /** Enqueues the payload and its wire policy for the worker to frame and send. */
    public override sendFrame(frame: Frame, priority = RakNetPriority.NORMAL): void {
        if (this.closed) return;
        this.owner.queueFrame(this.sessionId, frame, priority);
    }

    /** Session timers and frame batching run in the worker. */
    public override sendFrameQueue(): void {}

    /** Begins a graceful disconnect in the worker. */
    public override disconnect(reason = 'client disconnect'): void {
        if (this.closed) return;
        this.owner.queueDisconnect(this.sessionId, reason, false);
        this.closed = true;
    }

    /** Closes this proxy immediately after the worker receives the command. */
    public override disconnectImmediate(reason = 'connection lost'): void {
        if (this.closed) return;
        this.owner.queueDisconnect(this.sessionId, reason, true);
        this.closed = true;
    }

    /** @inheritdoc */
    public override getState(): number {
        return this.closed ? SessionStatus.DISCONNECTED : SessionStatus.CONNECTED;
    }

    /** @inheritdoc */
    public override isActive(): boolean {
        return !this.closed;
    }

    /** @inheritdoc */
    public override isDisconnected(): boolean {
        return this.closed;
    }

    /** @inheritdoc */
    public override isClosing(): boolean {
        return this.closed;
    }

    /** @inheritdoc */
    public override isHandshaking(): boolean {
        return false;
    }

    /** Updates state when the worker's close event reaches the game thread. */
    public markClosed(): void {
        this.closed = true;
    }
}
