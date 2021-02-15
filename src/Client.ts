import Connection, { Priority } from './network/raknet/Connection';
import Dgram, { Socket } from 'dgram';
import { clearIntervalAsync, setIntervalAsync } from 'set-interval-async/dynamic';

import ConnectionRequest from '@jsprismarine/raknet/src/dist/protocol/ConnectionRequest';
import Crypto from 'crypto';
import EncapsulatedPacket from '@jsprismarine/raknet/src/dist/protocol/EncapsulatedPacket';
import { EventEmitter } from 'events';
import Identifiers from '@jsprismarine/raknet/src/dist/protocol/Identifiers';
import InetAddress from '@jsprismarine/raknet/src/dist/utils/InetAddress';
import LoggerBuilder from './utils/Logger';
import LoginPacket from './network/packet/LoginPacket';
import OpenConnectionReply1 from '@jsprismarine/raknet/src/dist/protocol/OpenConnectionReply1';
import OpenConnectionReply2 from '@jsprismarine/raknet/src/dist/protocol/OpenConnectionReply2';
import OpenConnectionRequest1 from '@jsprismarine/raknet/src/dist/protocol/OpenConnectionRequest1';
import OpenConnectionRequest2 from '@jsprismarine/raknet/src/dist/protocol/OpenConnectionRequest2';
import RakNetListener from '@jsprismarine/raknet/src/dist/RakNetListener';
import UnconnectedPing from '@jsprismarine/raknet/src/dist/protocol/UnconnectedPing';
import UnconnectedPong from '@jsprismarine/raknet/src/dist/protocol/UnconnectedPong';

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
    private readonly logger = new LoggerBuilder();
    private readonly address: InetAddress;
    private targetAddress!: InetAddress;
    private connection: Connection | null = null;
    private readonly socket = Dgram.createSocket({ type: 'udp4' });
    private get closed() {
        return false;
    }

    private connecting = false;
    private connected = false;
    private offlineHandled = false;
    private loginHandled = false;

    public constructor() {
        super();
        this.address = new InetAddress('0.0.0.0', getRandomInt(46000, 49999));
        this.socket.bind(this.address.getPort(), this.address.getAddress());
    }

    /**
     * Creates a packet listener on given address and port.
     */
    public async connect(address = '0.0.0.0', port = 19132) {
        this.targetAddress = new InetAddress(address, port);

        this.socket.on('message', (buffer: Buffer) => {
            void this.handle(buffer);
        });

        if (this.connection) throw new Error('Already connected/connecting to server.');

        this.logger.info('JSPrismarine client is now attempting to connect...');

        const timer = setIntervalAsync(async () => {
            if (this.closed) {
                await clearIntervalAsync(timer);
                return;
            }

            // Send a client packet to the server
            // so the server goes in target mode
            // and the login process starts
            if (!this.connecting) {
                const pk = new UnconnectedPing();
                pk.sendTimestamp = BigInt(Date.now());
                pk.clientGUID = this.clientGUID;
                pk.encode();
                await this.sendBuffer(pk.getBuffer());
            }

            if (this.connected && !this.loginHandled) {
                const pk = new LoginPacket();
                pk.encode();

                const sendPk = new EncapsulatedPacket();
                sendPk.reliability = 0;
                sendPk.buffer = pk.getBuffer();

                await this.connection!.addEncapsulatedToQueue(sendPk, Priority.NORMAL); // Packet needs to be splitted
                this.loginHandled = true;
            }

            await this.connection?.update(Date.now());
        }, RAKNET_TICK_LENGTH * 1000);
        return this;
    }

    private async handle(buffer: Buffer) {
        const header = buffer.readUInt8(); // Read packet header

        if (this.connection && this.offlineHandled) {
            return this.connection.receive(buffer);
        }

        let buf;
        switch (header) {
            case Identifiers.UnconnectedPong:
                buf = this.handleUnconnectedPong(buffer);
                await this.sendBuffer(buf);
                break;
            case Identifiers.OpenConnectionReply1:
                buf = this.handleOpenConnectionReply1(buffer);
                await this.sendBuffer(buf);
                break;
            case Identifiers.OpenConnectionReply2:
                this.handleOpenConnectionReply2(buffer);
                break;
            default:
                this.logger.warn(`Unhandled offline packet ID: ${header}`, 'Client/handle');
        }
    }

    public handleUnconnectedPong(buffer: Buffer) {
        // Decode server packet
        const decodedPacket = new UnconnectedPong(buffer);
        decodedPacket.decode();

        // Check packet validity
        // To refactor
        if (!decodedPacket.isValid()) {
            throw new Error('Received an invalid offline message');
        }

        // Encode response
        const packet = new OpenConnectionRequest1();
        packet.protocol = PROTOCOL;
        packet.mtuSize = DEF_MTU_SIZE;
        packet.encode();

        // Update session status
        // this.status = ConnectionStatus.Targetted;

        return packet.getBuffer();
    }

    public handleOpenConnectionReply1(buffer: Buffer) {
        // Decode server packet
        const decodedPacket = new OpenConnectionReply1(buffer);
        decodedPacket.decode();

        // Check packet validity
        // To refactor
        if (!decodedPacket.isValid()) {
            throw new Error('Received an invalid offline message');
        }

        // Encode response
        const packet = new OpenConnectionRequest2();
        packet.serverAddress = this.targetAddress;
        packet.mtuSize = DEF_MTU_SIZE;
        packet.clientGUID = this.clientGUID;
        packet.encode();

        // Update session status
        this.connecting = true;
        // This.status = ConnectionStatus.Connected;
        this.connection = new Connection(this, DEF_MTU_SIZE, this.targetAddress);

        return packet.getBuffer();
    }

    public handleOpenConnectionReply2(buffer: Buffer) {
        // Decode server packet
        const decodedPacket = new OpenConnectionReply2(buffer);
        decodedPacket.decode();

        // Check packet validity
        // To refactor
        if (!decodedPacket.isValid()) {
            throw new Error('Received an invalid offline message');
        }

        // Encode response (encapsulated)
        const packet = new ConnectionRequest();
        packet.clientGUID = this.clientGUID;
        packet.requestTimestamp = BigInt(Date.now());
        packet.encode();

        const sendPacket = new EncapsulatedPacket();
        sendPacket.reliability = 0;
        sendPacket.buffer = packet.getBuffer();

        void this.connection?.addToQueue(sendPacket, 1);

        this.offlineHandled = true;
        this.connected = true; // Should be... we can't rely on it
    }

    /**
     * Sends the buffer to the server
     *
     * @param buffer
     * @param address
     * @param port
     */
    public async sendBuffer(buffer: Buffer): Promise<void> {
        this.socket.send(buffer, 0, buffer.byteLength, this.targetAddress.getPort(), this.targetAddress.getAddress());
    }

    public getSocket(): Socket {
        return this.socket;
    }

    public getAddress(): InetAddress {
        return this.address;
    }

    public removeConnection(connection: Connection, reason: string): void {
        throw new Error('Method not implemented.');
    }
}
