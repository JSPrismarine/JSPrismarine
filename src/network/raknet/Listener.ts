import type Prismarine from '../../Prismarine';
import Identifiers from './protocol/Identifiers';
import Connection from './connection';
import ServerName from './utils/ServerName';
import InetAddress from './utils/InetAddress';
import { RemoteInfo, Socket } from 'dgram';
import { EventEmitter } from 'events';
import Crypto from 'crypto';
import Dgram from 'dgram';

import UnconnectedPing from './protocol/UnconnectedPing';
import UnconnectedPong from './protocol/UnconnectedPong';
import OpenConnectionRequest1 from './protocol/OpenConnectionRequest1';
import IncompatibleProtocolVersion from './protocol/IncompatibleProtocolVersion';
import OpenConnectionReply1 from './protocol/OpenConnectionReply1';
import OpenConnectionReply2 from './protocol/OpenConnectionReply2';
import OpenConnectionRequest2 from './protocol/OpenConnectionRequest2';
import { setIntervalAsync, clearIntervalAsync } from 'set-interval-async/fixed';

// Minecraft related protocol
const PROTOCOL = 10;

// Raknet ticks
const RAKNET_TPS = 100;
const RAKNET_TICK_LENGTH = 1 / RAKNET_TPS;

// Listen to packets and then process them
export default class Listener extends EventEmitter {
    private id: bigint;
    private name: ServerName;
    private socket!: Socket;
    private connections: Map<string, Connection> = new Map();
    private shutdown = false;
    private server: Prismarine;

    public constructor(server: Prismarine) {
        super();
        this.server = server;
        this.name = new ServerName(server);
        // Generate a signed random 64 bit GUID
        let uniqueId = Crypto.randomBytes(8).readBigInt64BE();
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
                return await (this.connections.get(
                    token
                ) as Connection).receive(buffer);
            }

            try {
                this.sendBuffer(
                    await this.handleUnconnected(buffer, rinfo),
                    rinfo.address,
                    rinfo.port
                );
            } catch (error: any) {
                this.server
                    .getLogger()
                    .debug(`Failed to handle an offline packet: ${error}`);
            }
        });

        return await new Promise((resolve, reject) => {
            const failFn = (e: Error) => reject(e);

            this.socket.once('error', failFn);
            this.socket.bind(port, address, () => {
                this.socket.removeListener('error', failFn);

                const timer = setIntervalAsync(async () => {
                    if (!this.shutdown) {
                        await Promise.all(
                            Array.from(
                                this.connections.values()
                            ).map((connection) => connection.update(Date.now()))
                        );
                    } else {
                        clearIntervalAsync(timer);
                    }
                }, RAKNET_TICK_LENGTH * 1000);

                resolve(this);
            });
        });
    }

    private async handleUnconnected(
        buffer: Buffer,
        rinfo: RemoteInfo
    ): Promise<Buffer> {
        const header = buffer.readUInt8();

        switch (header) {
            case Identifiers.Query:
                return (await this.server
                    .getQueryManager()
                    .onRaw(buffer, rinfo)) as Buffer;
            case Identifiers.UnconnectedPing:
                return await this.handleUnconnectedPing(buffer);
            case Identifiers.OpenConnectionRequest1:
                return await this.handleOpenConnectionRequest1(buffer);
            case Identifiers.OpenConnectionRequest2:
                return await this.handleOpenConnectionRequest2(
                    buffer,
                    new InetAddress(
                        rinfo.address,
                        rinfo.port,
                        rinfo.family == 'IPv4' ? 4 : 6 // v6 is not implemented yet
                    )
                );
            default:
                throw new Error(
                    `Unknown unconnected packet with ID: ${header}`
                );
        }
    }

    // async handlers

    private async handleUnconnectedPing(buffer: Buffer): Promise<Buffer> {
        return await new Promise((resolve) => {
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
        return await new Promise((resolve) => {
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
                return resolve(packet.getBuffer());
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
        return await new Promise((resolve) => {
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
    public removeConnection(connection: Connection, reason: string): void {
        let inetAddr = connection.getAddress();
        let token = `${inetAddr.getAddress()}:${inetAddr.getPort()}`;
        if (this.connections.has(token)) {
            this.connections.get(token)?.close();
            this.connections.delete(token);
        }
        this.emit('closeConnection', connection.getAddress(), reason);
    }

    /**
     * Send packet buffer to the client.
     */
    public sendBuffer(buffer: Buffer, address: string, port: number) {
        this.socket.send(buffer, 0, buffer.length, port, address);
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
