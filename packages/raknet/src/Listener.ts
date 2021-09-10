import Dgram, { RemoteInfo, Socket } from 'dgram';

import Connection from './Connection';
import Crypto from 'crypto';
import { EventEmitter } from 'events';
import Identifiers from './protocol/Identifiers';
import IncompatibleProtocolVersion from './protocol/IncompatibleProtocolVersion';
import InetAddress from './utils/InetAddress';
import OpenConnectionReply1 from './protocol/OpenConnectionReply1';
import OpenConnectionReply2 from './protocol/OpenConnectionReply2';
import OpenConnectionRequest1 from './protocol/OpenConnectionRequest1';
import OpenConnectionRequest2 from './protocol/OpenConnectionRequest2';
import UnconnectedPing from './protocol/UnconnectedPing';
import UnconnectedPong from './protocol/UnconnectedPong';

// Minecraft related protocol
const PROTOCOL = 10;

// Raknet ticks
const RAKNET_TPS = 100;
const RAKNET_TICK_LENGTH = 1 / RAKNET_TPS;

export default class Listener extends EventEmitter {
    private readonly guid: bigint;
    private readonly socket: Socket;
    private readonly connections: Map<string, Connection> = new Map();
    private readonly logger: any;
    private readonly onlineMode: boolean;

    // TODO: logger interface
    public constructor(logger: any, onlineMode = true) {
        super();
        this.logger = logger;
        this.onlineMode = onlineMode;
        this.socket = Dgram.createSocket({ type: 'udp4' });
        this.socket.on('message', this.handleRaw.bind(this));
        this.guid = Crypto.randomBytes(8).readBigInt64BE();
    }

    /**
     * Creates a packet listener on given address and port.
     */
    public async listen(address: string, port: number): Promise<Listener> {
        return new Promise((resolve, reject) => {
            const failFn = (e: Error) => {
                reject(e);
            };

            this.socket.once('error', failFn);
            this.socket.bind(port, address, () => {
                this.socket.removeListener('error', failFn);

                setInterval(() => {
                    this.emit('tick', Date.now());
                }, RAKNET_TICK_LENGTH * 1000);

                resolve(this);
            });
        });
    }

    public async kill(): Promise<void> {
        // Wait for all remining packets to be sent
        return new Promise((resolve) => {
            const inter = setInterval(() => {
                const packets = Array.from(this.connections.values()).map((a) => a.getSendQueue());

                if (packets.length <= 0) {
                    clearInterval(inter);
                    resolve();
                }
            }, 50);
        });
    }

    private handleRaw(buffer: Buffer, rinfo: RemoteInfo): void {
        const connection = this.getConnection(rinfo);
        connection == null
            ? this.handleUnconnected(buffer, rinfo).then((response) => {
                  this.sendBuffer(response, rinfo);
              })
            : connection.receive(buffer);
    }

    private async handleUnconnected(buffer: Buffer, rinfo: RemoteInfo): Promise<Buffer> {
        const header = buffer.readUInt8();

        switch (header) {
            case Identifiers.Query:
                this.emit('raw', buffer, new InetAddress(rinfo.address, rinfo.port));
                return buffer;
            case Identifiers.UnconnectedPing:
                return this.handleUnconnectedPing(buffer);
            case Identifiers.OpenConnectionRequest1:
                return this.handleOpenConnectionRequest1(buffer);
            case Identifiers.OpenConnectionRequest2:
                // TODO: move to rinfo
                return this.handleOpenConnectionRequest2(
                    buffer,
                    new InetAddress(
                        rinfo.address,
                        rinfo.port,
                        rinfo.family === 'IPv4' ? 4 : 6 // V6 is not implemented yet
                    ),
                    rinfo
                );
            default:
                throw new Error(`Unknown unconnected packet with ID: 0x${header.toString(16)}`);
        }
    }

    // Async handlers
    private async handleUnconnectedPing(buffer: Buffer): Promise<Buffer> {
        return new Promise((resolve) => {
            const decodedPacket = new UnconnectedPing(buffer);
            decodedPacket.decode();

            if (!decodedPacket.isValid()) {
                throw new Error('Received an invalid offline message');
            }

            const packet = new UnconnectedPong();
            packet.sendTimestamp = decodedPacket.sendTimestamp;
            packet.serverGUID = this.guid;

            // const serverQuery: ServerName = this.name;
            // this.emit('unconnectedPong', serverQuery);

            packet.serverName = 'MCPE;JSPrismarine;440;1.17.10;0;20;' + this.guid + ';Second line;Creative;';
            packet.encode();

            resolve(packet.getBuffer());
        });
    }

    private async handleOpenConnectionRequest1(buffer: Buffer): Promise<Buffer> {
        return new Promise((resolve) => {
            const decodedPacket = new OpenConnectionRequest1(buffer);
            decodedPacket.decode();

            if (!decodedPacket.isValid()) {
                throw new Error('Received an invalid offline message');
            }

            if (decodedPacket.protocol !== PROTOCOL) {
                const packet = new IncompatibleProtocolVersion();
                packet.protocol = PROTOCOL;
                packet.serverGUID = this.guid;
                packet.encode();

                const buffer = packet.getBuffer();
                resolve(buffer);
                return;
            }

            const packet = new OpenConnectionReply1();
            packet.serverGUID = this.guid;
            packet.mtuSize = decodedPacket.mtuSize;
            packet.encode();

            resolve(packet.getBuffer());
        });
    }

    public async handleOpenConnectionRequest2(
        buffer: Buffer,
        address: InetAddress,
        rinfo: RemoteInfo
    ): Promise<Buffer> {
        return new Promise((resolve) => {
            const decodedPacket = new OpenConnectionRequest2(buffer);
            decodedPacket.decode();

            if (!decodedPacket.isValid()) {
                throw new Error('Received an invalid offline message');
            }

            const packet = new OpenConnectionReply2();
            packet.serverGUID = this.guid;
            packet.mtuSize = decodedPacket.mtuSize;
            packet.clientAddress = address;
            packet.encode();

            this.connections.set(
                `${address.getAddress()}:${address.getPort()}`,
                new Connection(this, decodedPacket.mtuSize, rinfo, this.onlineMode)
            );

            resolve(packet.getBuffer());
        });
    }

    private getConnection(rinfo: RemoteInfo): Connection | null {
        const token = `${rinfo.address}:${rinfo.port}`;
        return this.connections.get(token) ?? null;
    }

    /**
     * Remove a connection from all connections.
     */
    public async removeConnection(connection: Connection, reason?: string): Promise<void> {
        const inetAddr = connection.getAddress();
        const token = `${inetAddr.getAddress()}:${inetAddr.getPort()}`;
        if (this.connections.has(token)) {
            await this.connections.get(token)?.close();
            this.connections.delete(token);
        }

        this.emit('closeConnection', connection.getAddress(), reason);
    }

    /**
     * Send packet buffer to the client.
     */
    public async sendBuffer(buffer: Buffer, rinfo: RemoteInfo): Promise<void> {
        return new Promise((resolve) => {
            this.socket.send(buffer, rinfo.port, rinfo.address, (_) => {
                // Ignore errors
                resolve();
            });
        });
    }

    public getSocket() {
        return this.socket;
    }

    public getConnections() {
        return this.connections;
    }
}
