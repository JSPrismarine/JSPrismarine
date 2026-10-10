import { randomBytes } from 'node:crypto';
import type { RemoteInfo } from 'node:dgram';
import { EventEmitter } from 'node:events';
import { RAKNET_TICK_INTERVAL_MS, UDP_HEADER_SIZE } from './Constants';
import RakNetSession, { RakNetRole } from './Session';
import { DATAGRAM_HEADER_BYTE_LENGTH } from './protocol/FrameSet';
import { MAX_FRAME_BYTE_LENGTH } from './protocol/Frame';
import { monotonicNow } from './utils/Clock';
import InetAddress from './utils/InetAddress';

import type { Logger, RakNetPeer } from './RakNetPeer';
import type Packet from './protocol/Packet';

/**
 * The largest content a single frame can carry.
 *
 * `Frame.toBinary` writes the content length *in bits* into an unsigned 16 bit field, so
 * anything past 8191 bytes silently wraps that field and the receiver reads a different
 * message than the one that was sent. On the network path `MAX_MTU_SIZE` keeps this
 * unreachable; in memory there is no path MTU to hide behind, so it has to be respected
 * deliberately.
 */
export const MAX_FRAME_CONTENT_BYTE_LENGTH = 0xffff >> 3;

/**
 * The MTU a loopback pair runs at.
 *
 * Not "as large as possible": the frame length field above caps a fragment at 8191 bytes,
 * and `Session.sendFrame` derives its fragment size as
 * `mtu - UDP_HEADER_SIZE - DATAGRAM_HEADER_BYTE_LENGTH - MAX_FRAME_BYTE_LENGTH`, so 8 KiB
 * lands at 8163 and stays inside it. That is still five and a half times the 1464 a real
 * connection negotiates, which is where the win is: a chunk batch that fragments seventeen
 * ways on the wire fragments three ways here.
 */
export const LOOPBACK_MTU_SIZE = 8192 + UDP_HEADER_SIZE;

export interface LoopbackOptions {
    /** What each side reports as the other's address. Cosmetic - nothing routes on it. */
    readonly serverAddress?: string;
    readonly serverPort?: number;
    readonly clientAddress?: string;
    readonly clientPort?: number;
}

/**
 * One end of a loopback pair: a {@link RakNetPeer} whose "socket" is the other end.
 *
 * Everything above this - framing, ordering, acknowledgement, reassembly, the connected
 * handshake - is the ordinary {@link RakNetSession}, unmodified. That is the entire point,
 * and it is worth being explicit about the alternative that was not taken: handing frames
 * across directly, skipping the reliability layer, would have meant reimplementing
 * `Session.handlePacket` - the disconnect, ping and state-machine dispatch that decides
 * what becomes an `encapsulated` event. Single player would then run *similar* code to
 * multiplayer rather than the same code, and the two would drift exactly where it is
 * hardest to notice.
 *
 * What is skipped is the offline exchange, which exists only to discover a path MTU and a
 * guid across a network that is not here.
 */
class LoopbackEndpoint extends EventEmitter implements RakNetPeer {
    private peer!: LoopbackEndpoint;
    private session: RakNetSession | null = null;

    /**
     * Datagrams waiting to reach the other end.
     *
     * Delivery is deferred to a microtask rather than made directly, so a packet answered
     * inline - a ping, a handshake step, any request the peer replies to at once - does not
     * nest a second delivery inside the first. Synchronously that recursion is bounded only
     * by how conversational the two ends are feeling.
     */
    private readonly outbox: Buffer[] = [];
    private scheduled = false;
    private stopped = false;

    public constructor(
        private readonly logger: Logger,
        public readonly localAddress: InetAddress,
        private readonly role: RakNetRole
    ) {
        super();
    }

    /** @internal */
    public attach(peer: LoopbackEndpoint): void {
        this.peer = peer;
    }

    /** @internal Builds this end's session. The pair is created together or not at all. */
    public openSession(remote: InetAddress, remoteGuid: bigint): RakNetSession {
        const rinfo: RemoteInfo = {
            address: remote.getAddress(),
            port: remote.getPort(),
            family: 'IPv4',
            size: 0
        };

        this.session = new RakNetSession(this, LOOPBACK_MTU_SIZE, rinfo, remoteGuid, this.role);
        return this.session;
    }

    public getSession(): RakNetSession | null {
        return this.session;
    }

    /** Present so a caller written against `ServerSocket` finds what it expects. */
    public getSessions(): RakNetSession[] {
        return this.session === null ? [] : [this.session];
    }

    public getLogger(): Logger {
        return this.logger;
    }

    public getAddress(): InetAddress {
        return this.localAddress;
    }

    public sendPacket<T extends Packet>(packet: T, _rinfo: RemoteInfo): void {
        packet.encode();
        this.sendBuffer(packet.getBuffer(), _rinfo);
    }

    public sendBuffer(buffer: Buffer, _rinfo: RemoteInfo): void {
        if (this.stopped) return;

        // Copied, so that `sendBuffer` owns bytes rather than borrowing a buffer - the same
        // contract dgram gives, where the kernel has copied before the call returns.
        //
        // It is insurance rather than a fix for something observed: `Packet.getBuffer`
        // hands back a *view* over the sender's internal write buffer, delivery then spans
        // a microtask, and on the far side `Frame.content` is in turn a subarray of what
        // arrived - so a consumer of `encapsulated` would be holding a window into the
        // sender's FrameSet. Nothing reuses an output FrameSet today. The receive path
        // already pools its packets, and the day the send path does too, this would fail as
        // corrupted chunk data rather than as an exception.
        this.outbox.push(Buffer.from(buffer));
        this.schedule();
    }

    public removeSession(session: RakNetSession, reason?: string): void {
        if (this.session !== session) return;
        this.session = null;

        this.emit('closeConnection', session.getAddress(), reason);
        this.logger.verbose(`Closed loopback session with ${session.getAddress()}, reason=${reason}`);
    }

    /** @internal Drives this end's session; the pair ticks both from one timer. */
    public update(now: number): void {
        this.session?.update(now);
    }

    /** @internal */
    public stop(): void {
        this.stopped = true;
        this.outbox.length = 0;
        this.removeAllListeners();
    }

    private schedule(): void {
        if (this.scheduled) return;

        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            // Taken in one go so anything queued while draining goes to the next pass,
            // which keeps delivery in send order.
            for (const buffer of this.outbox.splice(0)) {
                this.peer.receive(buffer);
            }
        });
    }

    private receive(buffer: Buffer): void {
        if (this.stopped || this.session === null) return;

        // A loopback peer is not hostile, but `handle` is the same parser the network path
        // uses and a bug in either end must not take the process down.
        try {
            this.session.handle(buffer);
        } catch (error: unknown) {
            this.logger.debug(
                `Discarded malformed loopback datagram, error=${error instanceof Error ? error.message : String(error)}`,
                'RakNet/LoopbackEndpoint/receive'
            );
        }
    }
}

export type { LoopbackEndpoint };

/**
 * A connected RakNet pair with no sockets under it, for running a server in the same
 * process as its client.
 *
 * This is what makes single player the same code path as multiplayer rather than a
 * reimplementation of it: the server keeps talking to a {@link RakNetSession} and cannot
 * tell it is not on a wire, and the client keeps speaking the protocol rather than reaching
 * into the server's state.
 *
 * @example
 * ```typescript
 * const loopback = new LoopbackSocket(logger);
 * await server.bootstrap({ listener: loopback.server });
 * const session = await loopback.connect();
 * ```
 */
export default class LoopbackSocket {
    public readonly server: LoopbackEndpoint;
    public readonly client: LoopbackEndpoint;

    private readonly serverGuid = randomBytes(8).readBigInt64BE();
    private readonly clientGuid = randomBytes(8).readBigInt64BE();
    private ticker: NodeJS.Timeout | undefined;
    private stopped = false;

    public constructor(
        private readonly logger: Logger,
        options: LoopbackOptions = {}
    ) {
        const serverAddress = new InetAddress(options.serverAddress ?? '127.0.0.1', options.serverPort ?? 19132, 4);
        const clientAddress = new InetAddress(options.clientAddress ?? '127.0.0.1', options.clientPort ?? 19133, 4);

        this.server = new LoopbackEndpoint(logger, serverAddress, RakNetRole.SERVER);
        this.client = new LoopbackEndpoint(logger, clientAddress, RakNetRole.CLIENT);

        this.server.attach(this.client);
        this.client.attach(this.server);
    }

    /**
     * Runs the connected handshake and resolves on the client's session.
     *
     * Call it once whatever is listening on {@link server} has registered its handlers:
     * `openConnection` fires from inside this, and a server that has not subscribed yet
     * would miss its own connection.
     */
    public async connect(timeoutMs = 5_000): Promise<RakNetSession> {
        if (this.stopped) throw new Error('Cannot connect on a killed LoopbackSocket');

        this.server.openSession(this.client.localAddress, this.clientGuid);
        const clientSession = this.client.openSession(this.server.localAddress, this.serverGuid);

        this.startTicking();

        return new Promise<RakNetSession>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.client.removeListener('openConnection', onOpen);
                reject(new Error('Loopback handshake timed out'));
            }, timeoutMs);
            timer.unref();

            const onOpen = (session: RakNetSession) => {
                clearTimeout(timer);
                resolve(session);
            };

            this.client.once('openConnection', onOpen);

            // Everything the offline exchange would have settled - the MTU, the guids - is
            // already known, so the pair starts at the connected handshake.
            clientSession.sendConnectionRequest(this.clientGuid);
        });
    }

    public kill(): void {
        if (this.stopped) return;

        this.stopped = true;
        clearTimeout(this.ticker);
        this.server.stop();
        this.client.stop();
    }

    private startTicking(): void {
        const tick = (delay: number) => {
            this.ticker = setTimeout(
                () => {
                    if (this.stopped) return;

                    const started = monotonicNow();
                    try {
                        // One reading for both ends: two sessions in the same pass should be
                        // judged against the same instant.
                        this.server.update(started);
                        this.client.update(started);
                    } catch (error: unknown) {
                        this.logger.error(
                            `Loopback tick failed, error=${error instanceof Error ? error.message : String(error)}`,
                            'RakNet/LoopbackSocket/tick'
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

    /** The fragment size this pair splits at, exposed for the test that pins it. @internal */
    public static get maxFragmentSize(): number {
        return LOOPBACK_MTU_SIZE - UDP_HEADER_SIZE - DATAGRAM_HEADER_BYTE_LENGTH - MAX_FRAME_BYTE_LENGTH;
    }
}
