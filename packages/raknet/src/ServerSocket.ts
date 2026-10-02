import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'events';
import Dgram, { type RemoteInfo } from 'node:dgram';
import { MIN_DATAGRAM_BYTE_LENGTH, RAKNET_TICK_INTERVAL_MS } from './Constants';
import RakNetSession from './Session';
import BitFlags from './protocol/BitFlags';
import { MessageIdentifiers } from './protocol/MessageIdentifiers';
import { OfflineHandler } from './protocol/OfflineHandler';
import type Packet from './protocol/Packet';
import { monotonicNow } from './utils/Clock';
import type { Logger, RakNetPeer } from './RakNetPeer';
import type { ServerName } from './utils/ServerName';

export default class ServerSocket extends EventEmitter implements RakNetPeer {
    private readonly socket: Dgram.Socket;
    private readonly guid: bigint;
    /**
     * Sessions keyed by "address:port". Every incoming datagram needs this lookup, so it
     * has to be O(1) rather than a scan of the whole connection list.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L3912 (GetRemoteSystemIndex)
     */
    private readonly sessions: Map<string, RakNetSession> = new Map();
    private ticker: NodeJS.Timeout | undefined;
    /** Set by {@link kill}; stops the tick loop and blocks any further send. */
    private stopped = false;

    private readonly offlineHandler = new OfflineHandler(this);

    public constructor(
        private maxConnections: number,
        private readonly onlineMode: boolean,
        public readonly serverName: ServerName,
        private readonly logger: Logger
    ) {
        super();
        this.socket = Dgram.createSocket('udp4').unref();
        // allocUnsafe would hand us recycled or zeroed memory, not a unique identifier.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L4525
        let guid = randomBytes(8).readBigInt64BE();
        while (guid === 0n) guid = randomBytes(8).readBigInt64BE();
        this.guid = guid;

        if (this.onlineMode) {
            this.logger.warn('Online mode is currently not supported.', 'RakNet/ServerSocket');
        }
    }

    public start(address: string, port: number): void {
        try {
            this.socket.bind(port, address);
        } catch (error: unknown) {
            if (error instanceof Error) {
                this.logger.error('Failed to bind socket, error message=%s', 'RakNet/ServerSocket/Start');
                this.logger.error(error, 'RakNet/ServerSocket/Start');
            }
        }

        // Each tick schedules the next one, so the handle has to be re-captured every
        // time: storing only the first meant clearTimeout later cleared a handle that had
        // already fired, and the loop went on ticking against a closed socket.
        const tick = (delay: number) => {
            this.ticker = setTimeout(
                () => {
                    if (this.stopped) return;

                    const started = monotonicNow();

                    // Rescheduled from `finally`, and each session isolated from the next. This
                    // is the only thing driving acknowledgements, retransmissions and timeouts
                    // for *every* connection, so a single session throwing used to stop all of
                    // them permanently - the loop simply never reached its own next call.
                    try {
                        // One reading for the whole pass: sessions in the same tick should be
                        // judged against the same instant, not against a clock that advances
                        // between them.
                        for (const session of this.sessions.values()) {
                            try {
                                session.update(started);
                            } catch (error: unknown) {
                                this.logger.error(
                                    `Session update failed for client=${session.getAddress()}, error=${
                                        error instanceof Error ? error.message : String(error)
                                    }`,
                                    'RakNet/ServerSocket/tick'
                                );
                            }
                        }
                    } finally {
                        // The interval is what the next pass should *start* after, so the work
                        // just done comes out of it. Sleeping a flat interval afterwards made the
                        // real period `interval + work`, which meant the polling rate fell away
                        // precisely as sessions were added and the work grew.
                        if (!this.stopped) tick(RAKNET_TICK_INTERVAL_MS - (monotonicNow() - started));
                    }
                },
                Math.max(0, delay)
            );
            this.ticker.unref();
        };

        // Start ticking
        tick(RAKNET_TICK_INTERVAL_MS);

        this.socket.on('message', this.handleMessage.bind(this));
    }

    private handleMessage(msg: Buffer, rinfo: RemoteInfo): void {
        // Nothing RakNet can act on fits in two bytes - the shortest acknowledgement is
        // seven, the shortest datagram eight - so RakNet rejects them before the reliability
        // layer rather than letting the decoder discover it.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L4582
        if (msg.byteLength <= MIN_DATAGRAM_BYTE_LENGTH) return;

        // A malformed datagram must cost the sender its own packet, nothing more. This
        // runs straight off the dgram listener, so anything escaping here becomes an
        // uncaughtException and takes the whole process down with it. RakNet rejects bad
        // packets inline and keeps going.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L888
        try {
            // Offline traffic is recognised by its message id, the way RakNet recognises it,
            // and not by the datagram header alone: QUERY is 0xfe, which has the VALID bit
            // set, so testing that bit on its own sent every query datagram down the
            // connected path to be dropped as sessionless - and the `raw` event the query
            // listener is built on could never fire.
            // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L4580
            if ((msg[0]! & BitFlags.VALID) === 0 || msg[0] === MessageIdentifiers.QUERY) {
                this.offlineHandler.process(msg, rinfo);
            } else {
                // Normally RakNet ignores unhandled packets, but we still want some logs...
                // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5465
                let session;
                if ((session = this.getSessionByAddress(rinfo)) !== null) {
                    session.handle(msg);
                } else {
                    // May be triggered by the ACK of disconnect packet that is received after session is closed
                    this.logger.debug(
                        `Cannot handle Datagram for unconnected client=${rinfo.address}:${rinfo.port}, bytes=${msg.byteLength}`,
                        'RakNet/ServerSocket/handleMessage'
                    );
                }
            }
        } catch (error: unknown) {
            this.logger.debug(
                `Discarded malformed datagram from client=${rinfo.address}:${rinfo.port}, error=${
                    error instanceof Error ? error.message : String(error)
                }`,
                'RakNet/ServerSocket/handleMessage'
            );
        }
    }

    public kill(): void {
        if (this.stopped) return;

        // Everyone is told the server is going, rather than left to work it out from ten
        // seconds of silence. RakNet's `Shutdown` does the same and then blocks until each
        // reliability layer has drained; this cannot block, so each session says goodbye and
        // is dropped in the same breath - the linger it would otherwise get is worth nothing
        // once the tick loop has stopped, and dropping it here is what emits
        // `closeConnection` while there is still anything listening.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L1041
        for (const session of this.getSessions()) {
            session.sendFrameQueue();
            session.disconnect('server closed');
            session.disconnectImmediate();
        }

        // Set before clearing the timer: a tick already in flight must not run a session
        // update that would send on a socket we are about to close.
        this.stopped = true;
        clearTimeout(this.ticker);

        // Make sure we don't send any more events.
        this.removeAllListeners();

        // Closed a tick late, on purpose: `dgram.send` is asynchronous however immediate the
        // priority was, so closing the handle in the same tick can drop the goodbyes that
        // have just been queued. The same reason `ClientSocket.kill` defers it.
        setImmediate(() => this.socket.close());
    }

    /**
     * Used to retrieve if we are overflowing the maximum
     * connections we can allow, value given in the constructor.
     * @returns {boolean} if we can hold new connections.
     */
    public allowIncomingConnections(): boolean {
        return this.sessions.size < this.maxConnections;
    }

    /**
     * Returns the maximum number of incoming connections.
     * @returns {number} the maximum connections we can allow.
     */
    public getMaxConnections(): number {
        return this.maxConnections;
    }

    /**
     * Sets the maximum number of allowed incoming connections.
     * @param {number} allowed - maximum number of connections.
     */
    public setMaxConnections(allowed: number): void {
        this.maxConnections = allowed;
    }

    private static sessionKey(address: string, port: number): string {
        return `${address}:${port}`;
    }

    public addSession(rinfo: RemoteInfo, mtuSize: number, incomingGuid: bigint): void {
        const key = ServerSocket.sessionKey(rinfo.address, rinfo.port);
        this.sessions.set(key, new RakNetSession(this, mtuSize, rinfo, incomingGuid));
        this.logger.verbose(`Session created for client=${rinfo.address}:${rinfo.port}, mtu=${mtuSize}`);
        this.serverName.setOnlinePlayerCount(this.sessions.size);
    }

    public removeSession(session: RakNetSession, reason?: string): void {
        const key = ServerSocket.sessionKey(session.rinfo.address, session.rinfo.port);
        // Only drop the entry if it is still this exact session: the address may already
        // have been reused by a newer connection.
        if (this.sessions.get(key) !== session) return;
        this.sessions.delete(key);

        this.emit('closeConnection', session.getAddress(), reason);
        this.logger.verbose(`Closed session for client=${session.getAddress()}, reason=${reason}`);
        this.serverName.setOnlinePlayerCount(this.sessions.size);
    }

    public getLogger(): Logger {
        return this.logger;
    }

    public getSessions(): RakNetSession[] {
        return Array.from(this.sessions.values());
    }

    public getSessionByAddress(rinfo: RemoteInfo): RakNetSession | null {
        return this.sessions.get(ServerSocket.sessionKey(rinfo.address, rinfo.port)) ?? null;
    }

    public getSessionByGUID(guid: bigint): RakNetSession | null {
        for (const session of this.sessions.values()) {
            if (session.guid === guid) return session;
        }
        return null;
    }

    public getServerGuid(): bigint {
        return this.guid;
    }

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
}
