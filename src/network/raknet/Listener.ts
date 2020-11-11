import type Prismarine from '../../Prismarine';
import Identifiers from './protocol/Identifiers';
import Connection from './connection';
import ServerName from './utils/ServerName';
import InetAddress from './utils/InetAddress';

const Dgram = require('dgram');
const Crypto = require('crypto');
const EventEmitter = require('events');

const UnconnectedPing = require('./protocol/unconnected_ping');
const UnconnectedPong = require('./protocol/unconnected_pong');
const OpenConnectionRequest1 = require('./protocol/open_connection_request_1');
const OpenConnectionReply1 = require('./protocol/open_connection_reply_1');
const OpenConnectionRequest2 = require('./protocol/open_connection_request_2');
const OpenConnectionReply2 = require('./protocol/open_connection_reply_2');
const IncompatibleProtocolVersion = require('./protocol/incompatible_protocol_version');

// Minecraft related protocol
const PROTOCOL = 10;

// Raknet ticks
const RAKNET_TPS = 100;
const RAKNET_TICK_LENGTH = 1 / RAKNET_TPS;

// Listen to packets and then process them
export default class Listener extends EventEmitter {
    server: Prismarine;

    /** @type {number} */
    private id = Crypto.randomBytes(8).readBigInt64BE(); // Generate a signed random 64 bit GUID
    /** @type {ServerName} */
    private name: ServerName;
    /** @type {Dgram.Socket} */
    private socket: any;
    /** @type {Map<string, Connection>} */
    private connections: Map<string, Connection> = new Map();
    /** @type {boolean} */
    private shutdown = false;

    constructor(server: Prismarine) {
        super();
        this.server = server;
        this.name = new ServerName(server);
    }

    /**
     * Creates a packet listener on given address and port.
     */
    async listen(address: string, port: number) {
        this.socket = Dgram.createSocket({ type: 'udp4' });
        this.name.setServerId(this.id);

        this.socket.on('message', (buffer: Buffer, rinfo: any) => {
            this.handle(buffer, rinfo);
        });

        await new Promise((resolve, reject) => {
            const failFn = (e: Error) => reject(e);

            this.socket.once('error', failFn);
            this.socket.bind(port, address, () => {
                this.socket.removeListener('error', failFn);
                resolve();
            });
        });

        this.tick(); // tick sessions
        return this;
    }

    handle(buffer: Buffer, rinfo: any) {
        let header = buffer.readUInt8(); // Read packet header to recognize packet type

        if (header === Identifiers.Query) {
            this.emit('raw', buffer, rinfo);
            return;
        }

        let token = `${rinfo.address}:${rinfo.port}`;
        if (this.connections.has(token)) {
            let connection = this.connections.get(token);
            connection?.receive(buffer);
        } else {
            switch (header) {
                case Identifiers.UnconnectedPing:
                    this.handleUnconnectedPing(buffer).then((buffer) => {
                        this.socket.send(
                            buffer,
                            0,
                            buffer.length,
                            rinfo.port,
                            rinfo.address
                        );
                    });
                    break;
                case Identifiers.OpenConnectionRequest1:
                    this.handleOpenConnectionRequest1(buffer).then((buffer) => {
                        this.socket.send(
                            buffer,
                            0,
                            buffer.length,
                            rinfo.port,
                            rinfo.address
                        );
                    });
                    break;
                case Identifiers.OpenConnectionRequest2:
                    let address = new InetAddress(rinfo.address, rinfo.port);
                    this.handleOpenConnectionRequest2(buffer, address).then(
                        (buffer) => {
                            this.socket.send(
                                buffer,
                                0,
                                buffer.length,
                                rinfo.port,
                                rinfo.address
                            );
                        }
                    );
                    break;
                default:
                    break;
            }
        }
    }

    // async handlers

    async handleUnconnectedPing(buffer: Buffer) {
        let decodedPacket, packet;

        // Decode server packet
        decodedPacket = new UnconnectedPing();
        decodedPacket.buffer = buffer;
        decodedPacket.read();

        // Check packet validity
        // To refactor
        if (!decodedPacket.valid) {
            throw new Error('Received an invalid offline message');
        }

        // Encode response
        packet = new UnconnectedPong();
        packet.sendTimestamp = decodedPacket.sendTimeStamp;
        packet.serverGUID = this.id;

        let serverQuery = this.name;

        /**
         * @param {ServerName} serverQuery
         */
        this.emit('unconnectedPong', serverQuery);

        packet.serverName = serverQuery.toString();
        packet.write();

        return packet.buffer;
    }

    async handleOpenConnectionRequest1(buffer: Buffer) {
        let decodedPacket, packet;

        // Decode server packet
        decodedPacket = new OpenConnectionRequest1();
        decodedPacket.buffer = buffer;
        decodedPacket.read();

        // Check packet validity
        // To refactor
        if (!decodedPacket.valid) {
            throw new Error('Received an invalid offline message');
        }

        if (decodedPacket.protocol !== PROTOCOL) {
            packet = new IncompatibleProtocolVersion();
            packet.protocol = PROTOCOL;
            packet.serverGUID = this.id;
            packet.write();
            return packet.buffer;
        }

        // Encode response
        packet = new OpenConnectionReply1();
        packet.serverGUID = this.id;
        packet.mtuSize = decodedPacket.mtuSize;
        packet.write();

        return packet.buffer;
    }

    async handleOpenConnectionRequest2(buffer: Buffer, address: any) {
        let decodedPacket, packet;

        // Decode server packet
        decodedPacket = new OpenConnectionRequest2();
        decodedPacket.buffer = buffer;
        decodedPacket.read();

        // Check packet validity
        // To refactor
        if (!decodedPacket.valid) {
            throw new Error('Received an invalid offline message');
        }

        // Encode response
        packet = new OpenConnectionReply2();
        packet.serverGUID = this.id;
        packet.mtuSize = decodedPacket.mtuSize;
        packet.clientAddress = address;
        packet.write();

        // Create a session
        let token = `${address.address}:${address.port}`;
        let conn = new Connection(this, decodedPacket.mtuSize, address);
        this.connections.set(token, conn);

        return packet.buffer;
    }

    tick() {
        let int = setInterval(() => {
            if (!this.shutdown) {
                for (let [_, connection] of this.connections) {
                    connection.update(Date.now());
                }
            } else {
                clearInterval(int);
            }
        }, RAKNET_TICK_LENGTH * 1000);
    }

    /**
     * Remove a connection from all connections.
     */
    removeConnection(connection: Connection, reason: string) {
        let inetAddr = connection.address;
        let token = `${inetAddr.address}:${inetAddr.port}`;
        if (this.connections.has(token)) {
            this.connections.get(token)?.close();
            this.connections.delete(token);
        }
        this.emit('closeConnection', connection.address, reason);
    }

    /**
     * Send packet buffer to the client.
     */
    sendBuffer(buffer: Buffer, address: string, port: number) {
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
