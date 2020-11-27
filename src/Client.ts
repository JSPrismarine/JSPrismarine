import LoggerBuilder from './utils/Logger';
import RakNetListener from './network/raknet/RakNetListener';
import Dgram, { Socket } from 'dgram';
import Connection, { Priority, Status } from './network/raknet/Connection';
import InetAddress from './network/raknet/utils/InetAddress';
import { EventEmitter } from 'events';
import Identifiers from './network/raknet/protocol/Identifiers';
import {
    clearIntervalAsync,
    setIntervalAsync
} from 'set-interval-async/dynamic';
import UnconnectedPing from './network/raknet/protocol/UnconnectedPing';
import Crypto from 'crypto';
import UnconnectedPong from './network/raknet/protocol/UnconnectedPong';
import OpenConnectionRequest1 from './network/raknet/protocol/OpenConnectionRequest1';
import OpenConnectionReply1 from './network/raknet/protocol/OpenConnectionReply1';
import OpenConnectionRequest2 from './network/raknet/protocol/OpenConnectionRequest2';
import OpenConnectionReply2 from './network/raknet/protocol/OpenConnectionReply2';
import ConnectionRequest from './network/raknet/protocol/ConnectionRequest';
import EncapsulatedPacket from './network/raknet/protocol/EncapsulatedPacket';
import LoginPacket from './network/packet/LoginPacket';
import { RSA_PKCS1_OAEP_PADDING } from 'constants';

// https://stackoverflow.com/a/1527820/3142553
const getRandomInt = (min: number, max: number) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Minecraft related protocol
const PROTOCOL = 10;

// Max net transfer unit
const DEF_MTU_SIZE = 1455;

// Raknet ticks
const RAKNET_TPS = 100;
const RAKNET_TICK_LENGTH = 1 / RAKNET_TPS;

export default class Client extends EventEmitter implements RakNetListener {
    private clientGUID = Crypto.randomBytes(8).readBigInt64BE();
    private logger = new LoggerBuilder();
    private address: InetAddress;
    private targetAddress!: InetAddress;
    private connection: Connection | null = null;
    private socket = Dgram.createSocket({ type: 'udp4' });
    private closed = false;
    private connecting = false;
    private connected = false;
    private offlineHandled = false;
    private loginHandled = false;

    public constructor() {
        super();
        const address = (this.address = new InetAddress(
            '0.0.0.0',
            getRandomInt(46000, 49999)
        ));
        this.socket.bind(address.getPort(), address.getAddress());
    }

    /**
     * Creates a packet listener on given address and port.
     */
    public async connect(address: string = '0.0.0.0', port: number = 19132) {
        this.targetAddress = new InetAddress(address, port);

        this.socket.on('message', (buffer: Buffer) => {
            this.handle(buffer);
        });

        // TODO: check if it's already connecting...
        this.logger.info('JSPrismarine client is now attempting to connect...');

        const timer = setIntervalAsync(async () => {
            if (!this.closed) {
                // Send a client packet to the server
                // so the server goes in target mode
                // and the login process starts
                if (!this.connecting) {
                    const pk = new UnconnectedPing();
                    pk.sendTimestamp = BigInt(Date.now());
                    pk.clientGUID = this.clientGUID;
                    pk.encode();
                    this.sendBuffer(pk.getBuffer());

                    console.log(
                        `[PING] Sent ping to ${this.targetAddress.getAddress()}:${this.targetAddress.getPort()}`
                    );
                    console.log('-'.repeat(40));
                }

                if (this.connected && !this.loginHandled) {
                    const pk = new LoginPacket();
                    pk.encode();
                    
                    const sendPk = new EncapsulatedPacket();
                    sendPk.reliability = 0;
                    sendPk.buffer = pk.getBuffer();

                    this.connection!.addEncapsulatedToQueue(sendPk, Priority.NORMAL);  // packet needs to be splitted
                    this.loginHandled = true;
                } 

                this.connection?.update(Date.now());
            } else {
                clearIntervalAsync(timer);
            }
        }, RAKNET_TICK_LENGTH * 1000);
        return this;
    }

    private handle(buffer: Buffer) {
        let header = buffer.readUInt8(); // Read packet header

        if (this.connection && this.offlineHandled) {
            return this.connection.receive(buffer);
        } else {
            let buf;
            switch (header) {
                case Identifiers.UnconnectedPong:
                    buf = this.handleUnconnectedPong(buffer);
                    this.sendBuffer(buf);
                    console.log('[Client] Got unconnected pong!');
                    break;
                case Identifiers.OpenConnectionReply1:
                    buf = this.handleOpenConnectionReply1(buffer);
                    this.sendBuffer(buf);
                    break;
                case Identifiers.OpenConnectionReply2:
                    this.handleOpenConnectionReply2(buffer);
                    break;
                default:
                    console.log(`Unhandled offline packet ID: ${header}`);
            }
        }
    }

    public handleUnconnectedPong(buffer: Buffer) {
        let decodedPacket, packet;

        // Decode server packet
        decodedPacket = new UnconnectedPong(buffer);
        decodedPacket.decode();

        // Check packet validity
        // To refactor
        if (!decodedPacket.isValid()) {
            throw new Error('Received an invalid offline message');
        }

        // Encode response
        packet = new OpenConnectionRequest1();
        packet.protocol = PROTOCOL;
        packet.mtuSize = DEF_MTU_SIZE;
        packet.encode();

        // Update session status
        // this.status = ConnectionStatus.Targetted;

        return packet.getBuffer();
    }

    public handleOpenConnectionReply1(buffer: Buffer) {
        let decodedPacket, packet;

        // Decode server packet
        decodedPacket = new OpenConnectionReply1(buffer);
        decodedPacket.decode();

        // Check packet validity
        // To refactor
        if (!decodedPacket.isValid()) {
            throw new Error('Received an invalid offline message');
        }

        console.log('[MTU SIZE] ' + decodedPacket.mtuSize)
        console.log('[SERVER ID] ' + decodedPacket.serverGUID)
        console.log('-'.repeat(40))

        // Encode response
        packet = new OpenConnectionRequest2();
        packet.serverAddress = this.targetAddress;
        packet.mtuSize = DEF_MTU_SIZE;
        packet.clientGUID = this.clientGUID;
        packet.encode();

        // Update session status
        this.connecting = true;
        // this.status = ConnectionStatus.Connected;
        this.connection = new Connection(
            this,
            DEF_MTU_SIZE,
            this.targetAddress
        );

        return packet.getBuffer();
    }

    public handleOpenConnectionReply2(buffer: Buffer) {
        let decodedPacket, packet;

        // Decode server packet
        decodedPacket = new OpenConnectionReply2(buffer);
        decodedPacket.decode();

        // Check packet validity
        // To refactor
        if (!decodedPacket.isValid()) {
            throw new Error('Received an invalid offline message');
        }

        const inetAddr = decodedPacket.clientAddress
        console.log('[SERVER ID] ' + decodedPacket.serverGUID)
        console.log(`[CLIENT ADDRESS] ${inetAddr.getAddress()}:${inetAddr.getPort()}`)
        console.log('[MTU SIZE] ' + decodedPacket.mtuSize)
        console.log('-'.repeat(40))

        // Encode response (encapsulated)
        packet = new ConnectionRequest();
        packet.clientGUID = this.clientGUID;
        packet.requestTimestamp = BigInt(Date.now());
        packet.encode();

        const sendPacket = new EncapsulatedPacket();
        sendPacket.reliability = 0;
        sendPacket.buffer = packet.getBuffer();

        this.connection?.addToQueue(sendPacket, 1)

        this.offlineHandled = true;
        this.connected = true; // should be... we can't rely on it
    }

    /**
     * Sends the buffer to the server
     *
     * @param buffer
     * @param address
     * @param port
     */
    public sendBuffer(buffer: Buffer): void {
        this.socket.send(
            buffer,
            0,
            buffer.byteLength,
            this.targetAddress.getPort(),
            this.targetAddress.getAddress()
        );
    }

    public getSocket(): Socket {
        return this.socket;
    }

    public removeConnection(connection: Connection, reason: string): void {
        throw new Error('Method not implemented.');
    }
}
