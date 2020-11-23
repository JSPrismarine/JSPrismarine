import Dgram from 'dgram';
import Identifiers from './protocol/Identifiers';
import ProtocolIdentifiers from '../Identifiers';
import Connection from './connection';
import LoggerBuilder from '../../utils/Logger';
import { EventEmitter } from 'events';
import Crypto from 'crypto';
import UnconnectedPong from './protocol/unconnected_pong';
import OpenConnectionRequest1 from './protocol/open_connection_request_1';
import OpenConnectionReply1 from './protocol/open_connection_reply_1';
import OpenConnectionRequest2 from './protocol/open_connection_request_2';
import InetAddress from './utils/InetAddress';
import UnconnectedPing from './protocol/unconnected_ping';
import ResourcePackResponsePacket from '../packet/ResourcePackResponsePacket';
import ResourcePacksInfoPacket from '../packet/ResourcePacksInfoPacket';

// Minecraft related protocol
const PROTOCOL = 10;
const DEF_MTU_SIZE = 1455;

// Raknet ticks
const RAKNET_TPS = 100;
const RAKNET_TICK_LENGTH = 1 / RAKNET_TPS;

enum ConnectionStatus {
    Unconnected = 0,
    Targetted = 1,
    Connected = 2
}

// https://stackoverflow.com/a/1527820/3142553
const getRandomInt = (min: number, max: number) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Listen to packets and then process them
export default class Listener extends EventEmitter {
    private clientGUID: bigint = Crypto.randomBytes(8).readBigInt64BE();
    private address!: string;
    private port!: number;
    private status: ConnectionStatus = ConnectionStatus.Unconnected;
    private connection: any;
    private socket: any;
    private logger: LoggerBuilder;
    private closed: boolean = false;

    constructor(logger: LoggerBuilder) {
        super();
        this.logger = logger;
    }

    /**
     * Creates a packet listener on given address and port.
     */
    public async connect(address: string = '0.0.0.0', port: number = 19132) {
        this.address = address;
        this.port = 19132;
        this.socket = Dgram.createSocket({ type: 'udp4' });

        this.socket.on('message', (buffer: Buffer) => {
            this.handle(buffer);
        });

        this.socket.on('listening', () => {
            this.emit('listening');
        });

        this.socket.bind(getRandomInt(46000, 49999), '0.0.0.0');
        this.startTicker();
        return this;
    }

    public removeConnection() {
        this.logger.warn('Closing connection');
        this.closed = true;
        this.socket.close();
    }

    private async handle(buffer: Buffer) {
        let header = buffer.readUInt8(); // Read packet header

        if (this.status === ConnectionStatus.Connected) {
            if (!this.connection) {
                this.connection = new Connection(this, DEF_MTU_SIZE, '0.0.0.0');
            }
            return this.connection.receive(buffer);
        } else {
            switch (header) {
                case Identifiers.UnconnectedPong: {
                    const buf = await this.handleUnconnectedPong(buffer);
                    return this.socket.send(
                        buf,
                        0,
                        buf.length,
                        this.port,
                        this.address
                    );
                }
                case Identifiers.OpenConnectionReply1: {
                    const buf = await this.handleOpenConnectionReply1(buffer);
                    return this.socket.send(
                        buf,
                        0,
                        buf.length,
                        this.port,
                        this.address
                    );
                }
                default:
                    console.log(`Unhandled offline packet ID: ${header}`);
            }
        }
    }

    async handleUnconnectedPong(buffer: Buffer) {
        let decodedPacket, packet;

        // Decode server packet
        decodedPacket = new UnconnectedPong();
        (decodedPacket as any).buffer = buffer;
        decodedPacket.read();

        // Check packet validity
        // To refactor
        if (!decodedPacket.valid) {
            throw new Error('Received an invalid offline message');
        }

        // Encode response
        packet = new OpenConnectionRequest1();
        packet.protocol = PROTOCOL;
        packet.mtuSize = DEF_MTU_SIZE;
        packet.write();

        // Update session status
        this.status = ConnectionStatus.Targetted;

        return packet.getBuffer();
    }

    async handleOpenConnectionReply1(buffer: Buffer) {
        let decodedPacket, packet;

        // Decode server packet
        decodedPacket = new OpenConnectionReply1();
        (decodedPacket as any).buffer = buffer;
        decodedPacket.read();

        // Check packet validity
        // To refactor
        if (!decodedPacket.valid) {
            throw new Error('Received an invalid offline message');
        }

        // Encode response
        packet = new OpenConnectionRequest2();
        packet.serverAddress = new InetAddress(this.address, this.port, 4);
        packet.mtuSize = DEF_MTU_SIZE;
        (packet as any).clientGUID = this.clientGUID;
        packet.write();

        // Update session status
        this.status = ConnectionStatus.Connected;

        return packet.getBuffer();
    }

    startTicker() {
        const ticker = setInterval(() => {
            if (this.closed) return clearInterval(ticker);

            // Send a client packet to the server
            // so the server goes in target mode
            // and the login process starts
            if (this.status == ConnectionStatus.Unconnected) {
                let pk = new UnconnectedPing();
                (pk as any).sendTimeStamp = BigInt(Date.now());
                (pk as any).clientGUID = this.clientGUID;
                pk.write();
                this.socket.send(
                    pk.getBuffer(),
                    0,
                    pk.getBuffer().length,
                    this.port,
                    this.address,
                    (error: any) => {
                        if (error) throw error;

                        this.logger.silly(
                            `Sent ping to ${this.address}:${this.port}`
                        );
                    }
                );
            }

            if (this.connection) this.connection.update(Date.now());
        }, RAKNET_TICK_LENGTH * 1000);
    }
}
