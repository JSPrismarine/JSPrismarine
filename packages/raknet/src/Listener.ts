import Dgram, { RemoteInfo } from 'dgram';

import BitFlags from './protocol/BitFlags';
import { EventEmitter } from 'events';
import Packet from './protocol/Packet';
import { RAKNET_TPS } from './RakNet';
import RakNetSession from './Session';
import UnconnectedHandler from './protocol/UnconnectedHandler';

export default class RakNetListener extends EventEmitter {
    private readonly guid: bigint;
    private readonly sessions: Map<string, RakNetSession> = new Map();
    private readonly socket: Dgram.Socket;
    private readonly onlineMode: boolean;

    public constructor(onlineMode = true) {
        super();
        this.socket = Dgram.createSocket('udp4');
        this.onlineMode = onlineMode;
        this.guid = Buffer.allocUnsafe(8).readBigInt64BE();
    }

    public async start(address: string, port: number): Promise<RakNetListener> {
        return new Promise((resolve, reject) => {
            const failFn = (e: Error) => {
                reject(e);
            };

            const unconnHandler = new UnconnectedHandler(this);

            this.socket.once('error', failFn);
            this.socket.bind(port, address, () => {
                this.socket.removeListener('error', failFn);
                this.socket.on('message', async (msg, rinfo) => {
                    const header = msg[0];
                    if ((header & BitFlags.VALID) === 0) {
                        unconnHandler.handle(msg, rinfo);
                    } else {
                        this.getSession(rinfo)?.handle(msg);
                    }
                });

                setInterval(() => {
                    for (const session of this.getSessions()) {
                        if (session.isDisconnected()) {
                            this.removeSession(session);
                            return;
                        }
                        session.update(Date.now());
                    }
                }, RAKNET_TPS);

                resolve(this);
            });
        });
    }

    public kill(): void {
        // Send last remaining packets to all players
        for (const session of this.getSessions()) {
            session.sendFrameQueue();
        }
    }

    public addSession(rinfo: RemoteInfo, mtuSize: number) {
        this.sessions.set(`${rinfo.address}:${rinfo.port}`, new RakNetSession(this, mtuSize, rinfo, this.onlineMode));
    }

    public removeSession(session: RakNetSession, reason?: string): void {
        const inetAddr = session.getAddress();
        const token = `${inetAddr.getAddress()}:${inetAddr.getPort()}`;
        if (this.sessions.has(token)) {
            this.sessions.get(token)?.close();
            this.sessions.delete(token);
        }

        this.emit('closeConnection', session.getAddress(), reason);
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
