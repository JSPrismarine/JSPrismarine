import { pino, type Logger } from 'pino';

import { basename } from 'path';
import { fileURLToPath } from 'url';

import Dgram, { RemoteInfo } from 'dgram';

import BitFlags from './protocol/BitFlags.js';
import { EventEmitter } from 'events';
import Packet from './protocol/Packet.js';
import { RAKNET_TPS } from './RakNet.js';
import RakNetSession from './Session.js';
import UnconnectedHandler from './protocol/UnconnectedHandler.js';

export default class RakNetListener extends EventEmitter {
    private readonly socket: Dgram.Socket;
    private readonly onlineMode: boolean;
    private readonly guid: bigint;
    private readonly sessions: Map<string, RakNetSession> = new Map();
    private readonly logger: Logger;
    private ticker: NodeJS.Timer | undefined;

    public constructor(onlineMode = true) {
        super();
        this.socket = Dgram.createSocket('udp4');
        // Dereferencing the socket will allow
        // us closing the process while listening
        this.socket.unref();
        this.onlineMode = onlineMode;
        this.guid = Buffer.allocUnsafe(8).readBigInt64BE();
        this.logger = pino({ name: 'RakNet', base: undefined });
        this.logger.level = 'trace'; // TODO: via pino-pretty cli
    }

    public async start(address: string, port: number): Promise<RakNetListener> {
        return await new Promise((resolve, reject) => {
            const failFn = (e: Error) => {
                reject(e);
            };

            const unconnHandler = new UnconnectedHandler(this);

            this.socket.once('error', failFn);
            this.socket.bind(port, address, () => {
                this.socket.removeListener('error', failFn);
                this.socket.on('message', (msg, rinfo) => {
                    if ((msg[0] & BitFlags.VALID) === 0) {
                        unconnHandler.handle(msg, rinfo);
                    } else {
                        let session;
                        if ((session = this.getSession(rinfo)) !== null) {
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
                });
                resolve(this);
            });

            this.ticker = setInterval(() => {
                for (const session of this.sessions.values()) {
                    /* if (session.isDisconnected()) {
                        this.removeSession(session);
                        return;
                    } */
                    session.update(Date.now());
                }
            }, RAKNET_TPS);
        });
    }

    public kill(): void {
        // Send last remaining packets to all players
        for (const session of this.getSessions()) {
            session.sendFrameQueue();
        }

        this.ticker && clearInterval(this.ticker);
    }

    public addSession(rinfo: RemoteInfo, mtuSize: number) {
        this.sessions.set(`${rinfo.address}:${rinfo.port}`, new RakNetSession(this, mtuSize, rinfo));
        this.logger.debug('Session created for client=%o, mtu=%d', `${rinfo.address}:${rinfo.port}`, mtuSize);
    }

    public removeSession(session: RakNetSession, reason?: string): void {
        if (this.sessions.delete(session.getAddress().toToken())) {
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

    private getSession(rinfo: RemoteInfo): RakNetSession | null {
        return this.sessions.get(`${rinfo.address}:${rinfo.port}`) ?? null;
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
