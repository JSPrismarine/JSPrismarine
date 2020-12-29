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
import type Server from '../../Server';
import RakNetListener from './RakNetListener';
import ServerName from './utils/ServerName';
import UnconnectedPing from './protocol/UnconnectedPing';
import UnconnectedPong from './protocol/UnconnectedPong';

// Minecraft related protocol
const PROTOCOL = 10;

// Raknet ticks
const RAKNET_TPS = 100;
const RAKNET_TICK_LENGTH = 1 / RAKNET_TPS;

// Listen to packets and then process them
export default class Listener extends EventEmitter implements RakNetListener {
    private readonly id: bigint;
    private name: ServerName;
    private socket!: Socket;
    private readonly connections: Map<string, Connection> = new Map();
    private get shutdown() {
        return false;
    }

    private readonly server: Server;

    public constructor(server: Server) {
        super();
        this.server = server;
        this.name = new ServerName(server);
        // Generate a signed random 64 bit GUID
        const uniqueId = Crypto.randomBytes(8).readBigInt64BE();
        this.id = uniqueId;
        this.name.setServerId(uniqueId);
    }

    /**
     * Creates a packet listener on given address and port.
     */
    public async listen(address: string, port: number): Promise<Listener> {
        this.socket = Dgram.createSocket({ type: 'udp4' });
        this.socket.on('message', async (buffer: Buffer, rinfo: RemoteInfo) => {
            const token = `${rinfo.address}:${rinfo.port}`;
            if (this.connections.has(token)) {
                return (this.connections.get(token) as Connection).receive(
                    buffer
                );
            }

            try {
                await this.sendBuffer(
                    await this.handleUnconnected(buffer, rinfo),
                    rinfo.address,
                    rinfo.port
                );
            } catch (error: any) {
                this.server
                    .getLogger()
                    .debug(
                        `Failed to handle an offline packet: ${error}`,
                        'raknet/Listner/listen'
                    );
            }
        });

        return new Promise((resolve, reject) => {
            const failFn = (e: Error) => reject(e);

            this.socket.once('error', failFn);
            this.socket.bind(port, address, () => {
                this.socket.removeListener('error', failFn);

                const timer = setInterval(async () => {
                    if (!this.shutdown) {
                        await Promise.all(
                            Array.from(
                                this.connections.values()
                            ).map(async (conn) => conn.update(Date.now()))
                        );
                    } else {
                        clearInterval(timer);
                    }
                }, RAKNET_TICK_LENGTH * 1000);

                resolve(this);
            });
        });
    }

    public async kill(): Promise<void> {
        // Wait for all remining packets to be sent
        return new Promise((resolve) => {
            const inter = setInterval(() => {
                const packets = Array.from(this.connections.values()).map((a) =>
                    a.getSendQueue()
                );

                if (packets.length <= 0) {
                    clearInterval(inter);
                    return resolve();
                }
            }, 50);
        });
    }

    private async handleUnconnected(
        buffer: Buffer,
        rinfo: RemoteInfo
    ): Promise<Buffer> {
        const header = buffer.readUInt8();

        switch (header) {
            case Identifiers.Query:
                return this.server
                    .getQueryManager()
                    .onRaw(buffer, new InetAddress(rinfo.address, rinfo.port));
            case Identifiers.UnconnectedPing:
                return this.handleUnconnectedPing(buffer);
            case Identifiers.OpenConnectionRequest1:
                return this.handleOpenConnectionRequest1(buffer);
            case Identifiers.OpenConnectionRequest2:
                return this.handleOpenConnectionRequest2(
                    buffer,
                    new InetAddress(
                        rinfo.address,
                        rinfo.port,
                        rinfo.family === 'IPv4' ? 4 : 6 // V6 is not implemented yet
                    )
                );
            default:
                throw new Error(
                    `Unknown unconnected packet with ID: ${header}`
                );
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
            packet.serverGUID = this.id;

            const serverQuery: ServerName = this.name;
            this.emit('unconnectedPong', serverQuery);

            packet.serverName = serverQuery.toString();
            packet.encode();

            resolve(packet.getBuffer());
        });
    }

    private async handleOpenConnectionRequest1(
        buffer: Buffer
    ): Promise<Buffer> {
        return new Promise((resolve) => {
            const decodedPacket = new OpenConnectionRequest1(buffer);
            decodedPacket.decode();

            if (!decodedPacket.isValid()) {
                throw new Error('Received an invalid offline message');
            }

            if (decodedPacket.protocol !== PROTOCOL) {
                const packet = new IncompatibleProtocolVersion();
                packet.protocol = PROTOCOL;
                packet.serverGUID = this.id;
                packet.encode();

                const buffer = packet.getBuffer();
                return resolve(buffer);
            }

            const packet = new OpenConnectionReply1();
            packet.serverGUID = this.id;
            packet.mtuSize = decodedPacket.mtuSize;
            packet.encode();

            resolve(packet.getBuffer());
        });
    }

    public async handleOpenConnectionRequest2(
        buffer: Buffer,
        address: InetAddress
    ): Promise<Buffer> {
        return new Promise((resolve) => {
            const decodedPacket = new OpenConnectionRequest2(buffer);
            decodedPacket.decode();

            if (!decodedPacket.isValid()) {
                throw new Error('Received an invalid offline message');
            }

            const packet = new OpenConnectionReply2();
            packet.serverGUID = this.id;
            packet.mtuSize = decodedPacket.mtuSize;
            packet.clientAddress = address;
            packet.encode();

            this.connections.set(
                `${address.getAddress()}:${address.getPort()}`,
                new Connection(this, decodedPacket.mtuSize, address)
            );

            resolve(packet.getBuffer());
        });
    }

    /**
     * Remove a connection from all connections.
     */
    public async removeConnection(
        connection: Connection,
        reason: string
    ): Promise<void> {
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
    public async sendBuffer(
        buffer: Buffer,
        address: string,
        port: number
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket.send(buffer, 0, buffer.length, port, address, (err) => {
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

    public getName() {
        return this.name;
    }

    public setName(name: ServerName) {
        this.name = name;
    }
}
