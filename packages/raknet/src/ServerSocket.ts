import { pino, type Logger } from 'pino';
import Dgram, { type RemoteInfo } from 'node:dgram';
import BitFlags from './protocol/BitFlags.js';
import { EventEmitter } from 'events';
import Packet from './protocol/Packet.js';
import { RAKNET_TPS } from './RakNet.js';
import RakNetSession from './SessionV2.js';
import OfflineHandler from './protocol/OfflineHandler.js';

export default class ServerSocket extends EventEmitter {
    private readonly socket: Dgram.Socket;
    private readonly guid: bigint;
    private readonly sessions: Set<RakNetSession> = new Set();
    private readonly logger: Logger;
    private ticker: NodeJS.Timeout | undefined;

    private readonly offlineHandler = new OfflineHandler(this);

    public constructor(private maxConnections: number, private readonly onlineMode: boolean) {
        super();
        this.socket = Dgram.createSocket('udp4');
        // Dereferencing the socket will allow
        // us closing the process while listening
        this.socket.unref();
        this.guid = Buffer.allocUnsafe(8).readBigInt64BE();
        this.logger = pino({ name: 'RakNet', base: undefined });
        this.logger.level = 'trace'; // TODO: via pino-pretty cli
    }

    public start(address: string, port: number): void {
        try {
            this.socket.bind(port, address);
        } catch (e) {
            if (e instanceof Error) {
                this.logger.error('Failed to bind socket, error message=%s', e.message);
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
        if ((msg[0] & BitFlags.VALID) === 0) {
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
                    'Cannot handle Datagram for unconnected client=%s, buffer=%o',
                    `${rinfo.address}:${rinfo.port}`,
                    msg
                );
            }
        }
    }

    public kill(): void {
        // Send last remaining packets to all players
        for (const session of this.getSessions()) {
            // session.sendFrameQueue();
        }

        clearTimeout(this.ticker);
    }

    /**
     * Used to retrive if we are overflowing the maximum
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
    public setMaxConnections(allowed: number) {
        this.maxConnections = allowed;
    }

    public addSession(rinfo: RemoteInfo, mtuSize: number, incomingGuid: bigint) {
        this.sessions.add(new RakNetSession(this, mtuSize, rinfo, incomingGuid));
        this.logger.debug('Session created for client=%o, mtu=%d', `${rinfo.address}:${rinfo.port}`, mtuSize);
    }

    public removeSession(session: RakNetSession, reason?: string): void {
        if (this.sessions.delete(session)) {
            this.emit('closeConnection', session.getAddress(), reason);
            this.logger.debug('Closed session for client=%o, reason=%s', session.getAddress(), reason);
        }
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
