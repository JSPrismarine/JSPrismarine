import { ConnectionPriority, InetAddress, Protocol, RakNetSession, MessageIdentifiers } from '@jsprismarine/raknet';
import Dgram, { type Socket } from 'node:dgram';
import { Protocol as JSPProtocol, Logger } from '@jsprismarine/prismarine';
import { clearIntervalAsync, setIntervalAsync } from 'set-interval-async/dynamic';
import Crypto, { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';

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

export default class Client extends EventEmitter {
    private clientGUID = Crypto.randomBytes(8).readBigInt64BE();
    private readonly logger = new Logger();
    private readonly address: InetAddress;
    private targetAddress!: InetAddress;
    private connection: RakNetSession | null = null;
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
                const pk = new Protocol.UnconnectedPing();
                pk.timestamp = BigInt(Date.now());
                // TODO: can be omitted... pk. = this.clientGUID;
                pk.encode();
                await this.sendBuffer(pk.getBuffer());
            }

            if (this.connected && !this.loginHandled) {
                const pk = new JSPProtocol.Packets.LoginPacket();
                pk.encode();

                const sendPk = new Protocol.Frame();
                sendPk.reliability = 0;
                sendPk.content = pk.getBuffer();

                this.connection!.sendFrame(sendPk, ConnectionPriority.NORMAL); // Packet needs to be splitted
                this.loginHandled = true;
            }

            this.connection?.update(Date.now());
        }, RAKNET_TICK_LENGTH * 1000);
        return this;
    }

    private async handle(buffer: Buffer) {
        const header = buffer.readUInt8(); // Read packet header

        if (this.connection && this.offlineHandled) {
            this.connection.handle(buffer);
            return;
        }

        let buf;
        switch (header) {
            case MessageIdentifiers.UNCONNECTED_PONG:
                buf = this.handleUnconnectedPong(buffer);
                await this.sendBuffer(buf);
                break;
            case MessageIdentifiers.OPEN_CONNECTION_REPLY_1:
                buf = this.handleOpenConnectionReply1(buffer);
                await this.sendBuffer(buf);
                break;
            case MessageIdentifiers.OPEN_CONNECTION_REPLY_2:
                this.handleOpenConnectionReply2(buffer);
                break;
            default:
                this.logger.warn(`Unhandled offline packet ID: ${header}`, 'Client/handle');
        }
    }

    public handleUnconnectedPong(buffer: Buffer) {
        // Decode server packet
        const decodedPacket = new Protocol.UnconnectedPong(buffer);
        decodedPacket.decode();

        // Check packet validity
        // To refactor
        if (!decodedPacket.isValid()) {
            throw new Error('Received an invalid offline message');
        }

        // Encode response
        const packet = new Protocol.OpenConnectionRequest1();
        packet.protocol = PROTOCOL;
        packet.mtuSize = DEF_MTU_SIZE;
        packet.encode();

        // Update session status
        // this.status = ConnectionStatus.Targetted;

        return packet.getBuffer();
    }

    public handleOpenConnectionReply1(buffer: Buffer) {
        // Decode server packet
        const decodedPacket = new Protocol.OpenConnectionReply1(buffer);
        decodedPacket.decode();

        // Check packet validity
        // To refactor
        if (!decodedPacket.isValid()) {
            throw new Error('Received an invalid offline message');
        }

        // Encode response
        const packet = new Protocol.OpenConnectionRequest2();
        packet.serverAddress = this.targetAddress;
        packet.mtuSize = DEF_MTU_SIZE;
        packet.clientGUID = this.clientGUID;
        packet.encode();

        // Update session status
        this.connecting = true;
        // This.status = ConnectionStatus.Connected;
        this.connection = new RakNetSession(
            this as any,
            DEF_MTU_SIZE,
            {
                address: this.address.getAddress(),
                port: this.address.getPort(),
                family: 'IPv4',
                size: 0
            },
            randomBytes(8).readBigInt64BE()
        );

        return packet.getBuffer();
    }

    public handleOpenConnectionReply2(buffer: Buffer) {
        // Decode server packet
        const decodedPacket = new Protocol.OpenConnectionReply2(buffer);
        decodedPacket.decode();

        // Check packet validity
        // To refactor
        if (!decodedPacket.isValid()) {
            throw new Error('Received an invalid offline message');
        }

        // Encode response (encapsulated)
        const packet = new Protocol.ConnectionRequest();
        packet.clientGUID = this.clientGUID;
        packet.requestTimestamp = BigInt(Date.now());
        packet.encode();

        const sendPacket = new Protocol.Frame();
        sendPacket.reliability = 0;
        sendPacket.content = packet.getBuffer();

        this.connection?.sendFrame(sendPacket, ConnectionPriority.NORMAL);

        this.offlineHandled = true;
        this.connected = true; // Should be... we can't rely on it
    }

    /**
     * Sends the buffer to the server
     *
     * @param buffer
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

    public async removeConnection(_connection: RakNetSession, _reason?: string): Promise<void> {
        throw new Error('Method not implemented.');
    }
}
