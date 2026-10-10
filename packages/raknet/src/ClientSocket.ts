import { randomBytes } from 'node:crypto';
import Dgram, { type RemoteInfo } from 'node:dgram';
import { EventEmitter } from 'node:events';
import {
    CONNECTED_PING_INTERVAL_MS,
    CONNECTION_ATTEMPT_INTERVAL_MS,
    CONNECTION_ATTEMPT_TIMEOUT_MS,
    MAX_MTU_SIZE,
    MIN_MTU_SIZE,
    MIN_DATAGRAM_BYTE_LENGTH,
    MINECRAFT_PROTOCOL_VERSION,
    RAKNET_TICK_INTERVAL_MS,
    UDP_HEADER_SIZE
} from './Constants';
import RakNetSession, { RakNetRole } from './Session';
import BitFlags from './protocol/BitFlags';
import { OfflineClientHandler } from './protocol/OfflineClientHandler';
import OpenConnectionRequest1 from './protocol/connection/OpenConnectionRequest1';
import OpenConnectionRequest2 from './protocol/connection/OpenConnectionRequest2';
import UnconnectedPing from './protocol/offline/UnconnectedPing';
import { monotonicNow } from './utils/Clock';
import InetAddress from './utils/InetAddress';

import type { Logger, RakNetPeer } from './RakNetPeer';
import type Packet from './protocol/Packet';
import type OpenConnectionReply1 from './protocol/connection/OpenConnectionReply1';
import type OpenConnectionReply2 from './protocol/connection/OpenConnectionReply2';
import type UnconnectedPong from './protocol/offline/UnconnectedPong';

/**
 * The path MTUs an outgoing connection probes, largest first.
 *
 * RakNet sends the *same* request padded to each size in turn and lets the network decide:
 * a datagram too large for the path is simply never answered, so falling back a rung is
 * what a timeout means here. The ladder mirrors RakNet's own three sizes.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/MTUSize.h#L33
 */
const MTU_PROBE_LADDER: readonly number[] = [MAX_MTU_SIZE, 1200, MIN_MTU_SIZE];

/** Where an attempt has got to in the offline exchange. */
enum OfflineStage {
    OPEN_CONNECTION_REQUEST_1,
    OPEN_CONNECTION_REQUEST_2,
    /** The session exists and is running the connected handshake; offline retries stop. */
    ONLINE
}

interface ConnectAttempt {
    readonly rinfo: RemoteInfo;
    readonly resolve: (session: RakNetSession) => void;
    readonly reject: (error: Error) => void;
    stage: OfflineStage;
    /** Index into {@link MTU_PROBE_LADDER}; advances one rung per unanswered request. */
    mtuRung: number;
    /** Agreed once `OpenConnectionReply1` lands, and echoed back in the second request. */
    negotiatedMtu: number;
    serverGuid: bigint;
    nextRetryAt: number;
    readonly deadline: number;
    settled: boolean;
}

interface PendingPing {
    readonly token: string;
    readonly resolve: (result: PingResult) => void;
    readonly reject: (error: Error) => void;
    readonly sentAt: number;
    readonly deadline: number;
}

export interface PingResult {
    /** The raw MOTD line, e.g. `MCPE;Server;748;1.21.40;0;10;…`. */
    readonly serverName: string;
    readonly serverGuid: bigint;
    /** Round trip in milliseconds, on the monotonic clock. */
    readonly rtt: number;
}

export interface ClientSocketOptions {
    /** Overall budget for {@link ClientSocket.connect}. */
    readonly timeoutMs?: number;
    /** Local address to bind. The ephemeral port is always chosen by the OS. */
    readonly bindAddress?: string;
}

const clampMTU = (mtuSize: number): number =>
    Number.isFinite(mtuSize) ? Math.min(Math.max(Math.trunc(mtuSize), MIN_MTU_SIZE), MAX_MTU_SIZE) : MIN_MTU_SIZE;

/**
 * RakNet from the other side: opens one outgoing connection and drives a {@link RakNetSession}
 * over it.
 *
 * The reliability layer is not reimplemented here. A session does not know or care which
 * kind of peer owns its socket - see {@link RakNetPeer} - so ACK/NACK, ordering,
 * fragmentation and retransmission are the exact code paths the server runs, which is the
 * only way an outgoing connection is worth anything as a test of the incoming one.
 *
 * What *is* here is the part that has no session to lean on: the offline exchange. None of
 * it is reliable, so this class owns the retry timer and the MTU ladder, and hands over the
 * moment `OpenConnectionReply2` arrives.
 *
 * @example
 * ```typescript
 * const client = new ClientSocket(logger);
 * const session = await client.connect('127.0.0.1', 19132);
 * client.on('encapsulated', (frame) => handle(frame.content));
 * ```
 */
export default class ClientSocket extends EventEmitter implements RakNetPeer {
    private readonly socket: Dgram.Socket;
    private readonly guid: bigint;
    private readonly offlineHandler = new OfflineClientHandler(this);

    private session: RakNetSession | null = null;
    private attempt: ConnectAttempt | null = null;
    private readonly pendingPings: PendingPing[] = [];

    private ticker: NodeJS.Timeout | undefined;
    private lastPingAt = 0;
    private bound: Promise<void> | null = null;
    /** Set by {@link kill}; stops the tick loop and blocks any further send. */
    private stopped = false;

    public constructor(
        private readonly logger: Logger,
        private readonly options: ClientSocketOptions = {}
    ) {
        super();
        this.socket = Dgram.createSocket('udp4').unref();
        // allocUnsafe would hand us recycled or zeroed memory, not a unique identifier.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L4525
        let guid = randomBytes(8).readBigInt64BE();
        while (guid === 0n) guid = randomBytes(8).readBigInt64BE();
        this.guid = guid;
    }

    // ---------------------------------------------------------------- public surface

    /**
     * Opens a connection and resolves once the handshake has completed.
     *
     * Rejects with the server's own reason when it refuses us - full, banned, wrong
     * protocol version - rather than letting all four failures look like a timeout.
     * @param address - the server's address.
     * @param port - the server's port.
     * @returns the connected session.
     */
    public async connect(address: string, port: number): Promise<RakNetSession> {
        if (this.stopped) throw new Error('Cannot connect on a killed ClientSocket');
        if (this.attempt !== null || this.session !== null) {
            throw new Error('Already connecting or connected; use a ClientSocket per connection');
        }

        await this.ensureBound();

        const rinfo: RemoteInfo = { address, port, family: 'IPv4', size: 0 };
        const now = monotonicNow();

        return new Promise<RakNetSession>((resolve, reject) => {
            this.attempt = {
                rinfo,
                resolve,
                reject,
                stage: OfflineStage.OPEN_CONNECTION_REQUEST_1,
                mtuRung: 0,
                negotiatedMtu: MAX_MTU_SIZE,
                serverGuid: 0n,
                nextRetryAt: now,
                deadline: now + (this.options.timeoutMs ?? CONNECTION_ATTEMPT_TIMEOUT_MS),
                settled: false
            };

            this.once('openConnection', this.onSessionOpened);

            // Straight away rather than on the next tick: a loopback connection should not
            // pay a tick of latency to start.
            this.sendOfflineRequest(this.attempt);
        });
    }

    /**
     * Asks a server for its MOTD without connecting. Several may be in flight at once, so
     * a server list can be refreshed in one pass.
     * @param address - the server's address.
     * @param port - the server's port.
     * @param timeoutMs - how long to wait for the pong.
     */
    public async ping(address: string, port: number, timeoutMs = 2_000): Promise<PingResult> {
        if (this.stopped) throw new Error('Cannot ping on a killed ClientSocket');

        await this.ensureBound();

        const packet = new UnconnectedPing();
        packet.timestamp = BigInt(Date.now());

        const sentAt = monotonicNow();

        return new Promise<PingResult>((resolve, reject) => {
            this.pendingPings.push({
                token: `${address}:${port}`,
                resolve,
                reject,
                sentAt,
                deadline: sentAt + timeoutMs
            });

            this.sendPacket(packet, { address, port, family: 'IPv4', size: 0 });
        });
    }

    /** The live session, or null before the handshake completes and after it ends. */
    public getSession(): RakNetSession | null {
        return this.session;
    }

    /** Our own guid - the one the server knows us by. */
    public getClientGuid(): bigint {
        return this.guid;
    }

    public getLogger(): Logger {
        return this.logger;
    }

    /** The local address the socket bound to, available once {@link connect} has begun. */
    public getAddress(): InetAddress {
        const address = this.socket.address();
        return new InetAddress(address.address, address.port, 4);
    }

    /** Says goodbye properly, so the server drops the session rather than timing it out. */
    public disconnect(reason = 'client disconnect'): void {
        this.session?.disconnect(reason);
    }

    /** Tears everything down. The socket cannot be reused afterwards. */
    public kill(): void {
        if (this.stopped) return;

        // The goodbye goes out here, but the linger it would normally get is worth nothing
        // to a socket that is closing: no tick will be left to retransmit it. So the session
        // is dropped in the same breath, which is also what makes `closeConnection` - and so
        // the transport's own `close` - fire before this returns rather than never.
        const session = this.session;
        if (session !== null) {
            session.disconnect();
            session.disconnectImmediate();
        }

        // Set before clearing the timer: a tick already in flight must not run a session
        // update that would send on a socket we are about to close.
        this.stopped = true;
        clearTimeout(this.ticker);

        this.failAttempt(new Error('ClientSocket was killed'));
        this.failPendingPings(new Error('ClientSocket was killed'));

        this.removeAllListeners();

        // Closed a tick late, on purpose.
        //
        // `disconnect` above queues a DISCONNECTION_NOTIFICATION, and `dgram.send` is
        // asynchronous however immediate the priority was: closing the handle in the same
        // tick drops the datagram on the floor, and the goodbye is never sent. The server
        // then holds the session until it times out - ten seconds during which it counts
        // against the player limit. A fleet that reconnects finds the server full of
        // clients that already left, which is exactly the measurement a load test cannot
        // afford to get wrong.
        setImmediate(() => this.socket.close());
    }

    // ---------------------------------------------------------------- RakNetPeer

    public sendPacket<T extends Packet>(packet: T, rinfo: RemoteInfo): void {
        packet.encode();
        this.sendBuffer(packet.getBuffer(), rinfo);
    }

    public sendBuffer(buffer: Buffer, rinfo: RemoteInfo): void {
        // Sending on a closed socket throws ERR_SOCKET_DGRAM_NOT_RUNNING, which from a
        // timer callback would surface as an uncaughtException.
        if (this.stopped) return;

        this.socket.send(buffer, rinfo.port, rinfo.address);
    }

    public removeSession(session: RakNetSession, reason?: string): void {
        if (this.session !== session) return;
        this.session = null;

        this.emit('closeConnection', session.getAddress(), reason);
        this.logger.verbose(`Closed session with server=${session.getAddress()}, reason=${reason}`);

        // A session that dies during the connected handshake never emits `openConnection`,
        // so without this the promise would hang until the attempt deadline.
        this.failAttempt(new Error(`Disconnected before the handshake completed: ${reason}`));
    }

    // ---------------------------------------------------------------- offline callbacks

    /**
     * The server is willing and has told us the MTU it saw. Everything downstream sizes
     * buffers against this, so it is clamped exactly as the server clamps ours.
     */
    public onOpenConnectionReply1(reply: OpenConnectionReply1): void {
        const attempt = this.attempt;
        if (!attempt || attempt.stage !== OfflineStage.OPEN_CONNECTION_REQUEST_1) return;

        attempt.serverGuid = reply.serverGUID;
        attempt.negotiatedMtu = clampMTU(reply.mtuSize);
        attempt.stage = OfflineStage.OPEN_CONNECTION_REQUEST_2;

        this.sendOfflineRequest(attempt);
    }

    /** The connection is accepted: build the session and open the connected handshake. */
    public onOpenConnectionReply2(reply: OpenConnectionReply2, rinfo: RemoteInfo): void {
        const attempt = this.attempt;
        if (!attempt || attempt.stage !== OfflineStage.OPEN_CONNECTION_REQUEST_2) return;

        attempt.stage = OfflineStage.ONLINE;

        // The server's value, not ours: it is the one that sized its own session.
        const mtuSize = clampMTU(reply.mtuSize);
        this.session = new RakNetSession(this, mtuSize, rinfo, attempt.serverGuid, RakNetRole.CLIENT);
        this.logger.verbose(`Session created for server=${rinfo.address}:${rinfo.port}, mtu=${mtuSize}`);

        this.lastPingAt = monotonicNow();
        this.session.sendConnectionRequest(this.guid);
    }

    public onUnconnectedPong(pong: UnconnectedPong, rinfo: RemoteInfo): void {
        const token = `${rinfo.address}:${rinfo.port}`;
        const index = this.pendingPings.findIndex((pending) => pending.token === token);
        if (index === -1) return;

        const [pending] = this.pendingPings.splice(index, 1);
        pending!.resolve({
            serverName: pong.serverName,
            serverGuid: pong.serverGuid,
            rtt: monotonicNow() - pending!.sentAt
        });
    }

    /** The server refused us, and said why. Terminal: retrying cannot change the answer. */
    public onOfflineFailure(reason: string): void {
        this.failAttempt(new Error(`Connection refused: ${reason}`));
    }

    // ---------------------------------------------------------------- internals

    private readonly onSessionOpened = (session: RakNetSession): void => {
        const attempt = this.attempt;
        if (!attempt || attempt.settled) return;

        attempt.settled = true;
        this.attempt = null;
        attempt.resolve(session);
    };

    private ensureBound(): Promise<void> {
        if (this.bound) return this.bound;

        this.bound = new Promise<void>((resolve, reject) => {
            const onError = (error: Error) => reject(error);
            this.socket.once('error', onError);
            this.socket.bind(0, this.options.bindAddress ?? '0.0.0.0', () => {
                this.socket.removeListener('error', onError);
                this.socket.on('message', this.handleMessage);
                this.startTicking();
                resolve();
            });
        });

        return this.bound;
    }

    private startTicking(): void {
        // Each tick schedules the next one, so the handle has to be re-captured every time.
        // The interval is what the next pass should *start* after, so the work just done
        // comes out of it - the same drift correction ServerSocket applies.
        const tick = (delay: number) => {
            this.ticker = setTimeout(
                () => {
                    if (this.stopped) return;

                    const started = monotonicNow();
                    try {
                        this.tick(started);
                    } catch (error: unknown) {
                        this.logger.error(
                            `Tick failed, error=${error instanceof Error ? error.message : String(error)}`,
                            'RakNet/ClientSocket/tick'
                        );
                    } finally {
                        if (!this.stopped) tick(RAKNET_TICK_INTERVAL_MS - (monotonicNow() - started));
                    }
                },
                Math.max(0, delay)
            );
            this.ticker.unref();
        };

        tick(RAKNET_TICK_INTERVAL_MS);
    }

    private tick(now: number): void {
        this.expirePendingPings(now);

        const attempt = this.attempt;
        if (attempt && !attempt.settled) {
            if (now >= attempt.deadline) {
                this.failAttempt(new Error(`Connection to ${attempt.rinfo.address}:${attempt.rinfo.port} timed out`));
            } else if (attempt.stage !== OfflineStage.ONLINE && now >= attempt.nextRetryAt) {
                // An unanswered request may simply have been too large for the path, so
                // each retry drops a rung before repeating.
                attempt.mtuRung = Math.min(attempt.mtuRung + 1, MTU_PROBE_LADDER.length - 1);
                this.sendOfflineRequest(attempt);
            }
        }

        if (this.session) {
            if (now - this.lastPingAt >= CONNECTED_PING_INTERVAL_MS) {
                this.lastPingAt = now;
                this.session.sendConnectedPing();
            }

            this.session.update(now);
        }
    }

    private sendOfflineRequest(attempt: ConnectAttempt): void {
        attempt.nextRetryAt = monotonicNow() + CONNECTION_ATTEMPT_INTERVAL_MS;

        if (attempt.stage === OfflineStage.OPEN_CONNECTION_REQUEST_1) {
            const packet = new OpenConnectionRequest1();
            packet.protocol = MINECRAFT_PROTOCOL_VERSION;
            // The server reads the MTU off the *size of this datagram*, adding back the UDP
            // header it cannot see, so the padding is the probe. Asking for `mtu` here
            // rather than `mtu - UDP_HEADER_SIZE` would negotiate one header too many and
            // every full-size frame would fragment.
            packet.mtuSize = MTU_PROBE_LADDER[attempt.mtuRung]! - UDP_HEADER_SIZE;
            this.sendPacket(packet, attempt.rinfo);
            return;
        }

        const packet = new OpenConnectionRequest2();
        packet.serverAddress = new InetAddress(attempt.rinfo.address, attempt.rinfo.port, 4);
        packet.mtuSize = attempt.negotiatedMtu;
        packet.clientGUID = this.guid;
        this.sendPacket(packet, attempt.rinfo);
    }

    private readonly handleMessage = (msg: Buffer, rinfo: RemoteInfo): void => {
        // The same floor the server applies: too short to be anything, so it never reaches
        // a decoder that would only throw.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L4582
        if (msg.byteLength <= MIN_DATAGRAM_BYTE_LENGTH) return;

        // A malformed datagram must cost the sender its own packet, nothing more. This runs
        // straight off the dgram listener, so anything escaping here becomes an
        // uncaughtException and takes the whole process down with it.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L888
        try {
            if ((msg[0]! & BitFlags.VALID) === 0) {
                this.offlineHandler.process(msg, rinfo);
                return;
            }

            if (this.session && this.isSessionPeer(rinfo)) {
                this.session.handle(msg);
                return;
            }

            this.logger.debug(
                `Cannot handle datagram from unconnected server=${rinfo.address}:${rinfo.port}, bytes=${msg.byteLength}`,
                'RakNet/ClientSocket/handleMessage'
            );
        } catch (error: unknown) {
            this.logger.debug(
                `Discarded malformed datagram from server=${rinfo.address}:${rinfo.port}, error=${
                    error instanceof Error ? error.message : String(error)
                }`,
                'RakNet/ClientSocket/handleMessage'
            );
        }
    };

    /**
     * Anything can send us a datagram; only the peer we dialled may drive the session.
     * Without this an off-path sender could feed frames into the reliability layer.
     */
    private isSessionPeer(rinfo: RemoteInfo): boolean {
        const peer = this.session!.rinfo;
        return peer.address === rinfo.address && peer.port === rinfo.port;
    }

    private failAttempt(error: Error): void {
        const attempt = this.attempt;
        if (!attempt || attempt.settled) return;

        attempt.settled = true;
        this.attempt = null;
        this.removeListener('openConnection', this.onSessionOpened);
        attempt.reject(error);
    }

    private expirePendingPings(now: number): void {
        for (let i = this.pendingPings.length - 1; i >= 0; i--) {
            const pending = this.pendingPings[i]!;
            if (pending.deadline > now) continue;

            this.pendingPings.splice(i, 1);
            pending.reject(new Error(`Ping to ${pending.token} timed out`));
        }
    }

    private failPendingPings(error: Error): void {
        for (const pending of this.pendingPings.splice(0)) {
            pending.reject(error);
        }
    }
}
