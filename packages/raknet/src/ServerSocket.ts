import { EventEmitter } from 'events';
import Dgram, { type RemoteInfo } from 'node:dgram';
import { RAKNET_TPS } from './Constants';
import RakNetSession from './Session';
import BitFlags from './protocol/BitFlags';
import { OfflineHandler } from './protocol/OfflineHandler';
import type Packet from './protocol/Packet';
import type { ServerName } from './utils/ServerName';

type Logger = {
    info: Function;
    warn: Function;
    error: Function;
    verbose: Function;
    debug: Function;
    silly: Function;
};

export default class ServerSocket extends EventEmitter {
    private readonly socket: Dgram.Socket;
    private readonly guid: bigint;
    private readonly sessions: Set<RakNetSession> = new Set();
    private ticker: NodeJS.Timeout | undefined;

    private readonly offlineHandler = new OfflineHandler(this);

    public constructor(
        private maxConnections: number,
        private readonly onlineMode: boolean,
        public readonly serverName: ServerName,
        private readonly logger: Logger
    ) {
        super();
        this.socket = Dgram.createSocket('udp4').unref();
        this.guid = Buffer.allocUnsafe(8).readBigInt64BE();

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

        const tick = () =>
            setTimeout(() => {
                for (const session of this.sessions.values()) {
                    session.update(Date.now());
                }
                tick();
            }, RAKNET_TPS);

        // Start ticking
        this.ticker = tick();
        this.ticker.unref();

        this.socket.on('message', this.handleMessage.bind(this));
    }

    private handleMessage(msg: Buffer, rinfo: RemoteInfo): void {
        // Directly check if it's a offline message
        if ((msg[0]! & BitFlags.VALID) === 0) {
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
                    `Cannot handle Datagram for unconnected client=${rinfo.address}:${rinfo.port}, buffer=${msg}`,
                    'RakNet/ServerSocket/handleMessage'
                );
            }
        }
    }

    public kill(): void {
        // Send last remaining packets to all players
        for (const session of this.getSessions()) {
            // FIXME: This should be awaitable.
            session.sendFrameQueue();
        }

        clearTimeout(this.ticker);

        // Make sure we don't send any more events.
        this.removeAllListeners();

        // Finally, close the socket.
        this.socket.close();
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

    public addSession(rinfo: RemoteInfo, mtuSize: number, incomingGuid: bigint): void {
        this.sessions.add(new RakNetSession(this, mtuSize, rinfo, incomingGuid));
        this.logger.verbose(`Session created for client=${rinfo.address}:${rinfo.port}, mtu=${mtuSize}`);
        this.serverName.setOnlinePlayerCount(this.sessions.size);
    }

    public removeSession(session: RakNetSession, reason?: string): void {
        if (!this.sessions.delete(session)) return;
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
        return (
            this.getSessions().find(
                (session) => session.rinfo.address === rinfo.address && session.rinfo.port === rinfo.port
            ) ?? null
        );
    }

    public getSessionByGUID(guid: bigint): RakNetSession | null {
        return this.getSessions().find((session) => session.guid === guid) ?? null;
    }

    public getServerGuid(): bigint {
        return this.guid;
    }

    public sendPacket<T extends Packet>(packet: T, rinfo: RemoteInfo): void {
        packet.encode();
        this.sendBuffer(packet.getBuffer(), rinfo);
    }

    public sendBuffer(buffer: Buffer, rinfo: RemoteInfo): void {
        this.socket.send(buffer, rinfo.port, rinfo.address);
    }
}
