import PacketReliability, { isReliable } from './protocol/ReliabilityLayer';

import ACK from './protocol/ACK';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import BitFlags from './protocol/BitFlags';
import ConnectedPing from './protocol/ConnectedPing';
import ConnectedPong from './protocol/ConnectedPong';
import ConnectionRequest from './protocol/ConnectionRequest';
import ConnectionRequestAccepted from './protocol/ConnectionRequestAccepted';
import DataPacket from './protocol/DataPacket';
import EncapsulatedPacket from './protocol/EncapsulatedPacket';
import Identifiers from './protocol/Identifiers';
import InetAddress from './utils/InetAddress';
import NACK from './protocol/NACK';
import NewIncomingConnection from './protocol/NewIncomingConnection';
import Packet from './protocol/Packet';
import RakNetListener from './RakNetListener';

export enum Priority {
    NORMAL,
    IMMEDIATE
}

export enum Status {
    CONNECTING,
    CONNECTED,
    DISCONNECTING,
    DISCONNECTED
}

export default class Connection {
    private readonly listener: RakNetListener;
    private readonly mtuSize: number;
    protected address: InetAddress;

    // Client connection state
    private state = Status.CONNECTING;

    // Queue containing sequence numbers of packets not received
    private readonly nackQueue: Set<number> = new Set();
    // Queue containing sequence numbers to let know the game packets we sent
    private readonly ackQueue: Set<number> = new Set();
    // Queue containing cached packets in case recovery is needed
    private readonly recoveryQueue: Map<number, DataPacket> = new Map();
    // Need documentation
    private readonly packetToSend: Set<DataPacket> = new Set();
    // Queue holding packets to send
    private sendQueue = new DataPacket();

    // Map holding splits of split packets
    private readonly splitPackets: Map<
        number,
        Map<number, EncapsulatedPacket>
    > = new Map();

    // Map holding out of order reliable packets
    // private reliableMissing: Map<number, EncapsulatedPacket> = new Map();
    // Equivalent to recivedPacketBaseIndex in official RakNet
    // used to check if a reliable packet is out of order
    private lastReliableIndex = 0;

    // Array containing received sequence numbers
    private readonly receivedWindow: Set<number> = new Set();
    // Last received sequence number
    private lastSequenceNumber = -1;
    private sendSequenceNumber = 0;

    private messageIndex = 0;
    private readonly channelIndex: number[] = [];

    // Internal split Id
    private splitId = 0;

    // Last timestamp of packet received, helpful for timeout
    private lastUpdate: number = Date.now();
    private active = false;

    constructor(
        listener: RakNetListener,
        mtuSize: number,
        address: InetAddress
    ) {
        this.listener = listener;
        this.mtuSize = mtuSize;
        this.address = address;

        this.lastUpdate = Date.now();

        for (let i = 0; i < 32; i++) {
            this.channelIndex[i] = 0;
        }
    }

    public async update(timestamp: number): Promise<void> {
        return new Promise(async (resolve) => {
            if (!this.isActive() && this.lastUpdate + 10000 < timestamp) {
                this.disconnect('timeout');
                return;
            }

            this.active = false;

            if (this.ackQueue.size > 0) {
                const pk = new ACK();
                pk.setPackets(Array.from(this.ackQueue));
                await this.sendPacket(pk);
                this.ackQueue.clear();
            }

            if (this.nackQueue.size > 0) {
                const pk = new NACK();
                pk.setPackets(Array.from(this.nackQueue));
                await this.sendPacket(pk);
                this.nackQueue.clear();
            }

            if (this.packetToSend.size > 0) {
                let limit = 16;
                await Promise.all(
                    Array.from(this.packetToSend).map(async (pk) => {
                        pk.sendTime = timestamp;
                        pk.encode();
                        this.recoveryQueue.set(pk.sequenceNumber, pk);
                        this.packetToSend.delete(pk);
                        await this.sendPacket(pk);

                        if (--limit <= 0) {
                            return false;
                        }
                    })
                );

                // Packet queue bigger than limit
                if (this.packetToSend.size > 2048) {
                    this.packetToSend.clear();
                }
            }

            Array.from(this.recoveryQueue.entries()).forEach(([seq, pk]) => {
                if (pk.sendTime < Date.now() - 8000) {
                    this.packetToSend.add(pk);
                    this.recoveryQueue.delete(seq);
                }
            });

            await this.sendPacketQueue();
            resolve();
        });
    }

    public disconnect(reason = 'unknown'): void {
        this.listener.removeConnection(this, reason);
    }

    /**
     * Receive session packets
     */
    public async receive(buffer: Buffer): Promise<void> {
        this.active = true;
        this.lastUpdate = Date.now();
        const header = buffer.readUInt8();

        if ((header & BitFlags.VALID) === 0) {
            // Don't handle offline packets
        } else if (header & BitFlags.ACK) {
            return this.handleACK(buffer);
        } else if (header & BitFlags.NACK) {
            return this.handleNACK(buffer);
        } else {
            return this.handleDatagram(buffer);
        }
    }

    public async handleDatagram(buffer: Buffer): Promise<void> {
        return new Promise(async (resolve) => {
            const dataPacket = new DataPacket(buffer);
            dataPacket.decode();

            // Check if we already received packet and so we don't handle them
            // i still need to understand what are those window stuff
            if (this.receivedWindow.has(dataPacket.sequenceNumber)) {
                return resolve();
            }

            // Check if the packet was a missing one, so in the nack queue
            // if it was missing, remove from the queue because we received it now
            if (this.nackQueue.has(dataPacket.sequenceNumber)) {
                // May not need condition, to check
                this.nackQueue.delete(dataPacket.sequenceNumber);
            }

            // Add the packet to the 'sent' queue
            // to let know the game we sent the packet
            this.ackQueue.add(dataPacket.sequenceNumber);

            // Add the packet to the received window, a property that keeps
            // all the sequence numbers of packets we received
            // its function is to check if when we lost some packets
            // check wich are really lost by searching if we received it there
            this.receivedWindow.add(dataPacket.sequenceNumber);

            // Check if there are missing packets between the received packet and the last received one
            const diff = dataPacket.sequenceNumber - this.lastSequenceNumber;

            // Check if the sequence is broken due to a lost packet
            if (diff !== 1) {
                // As i said before, there we search for missing packets in the list of the recieved ones
                for (
                    let i = this.lastSequenceNumber + 1;
                    i < dataPacket.sequenceNumber;
                    i++
                ) {
                    // Adding the packet sequence number to the NACK queue and then sending a NACK
                    // will make the Client sending again the lost packet
                    if (!this.receivedWindow.has(i)) {
                        this.nackQueue.add(i);
                    }
                }
            }

            // If we received a lost packet we sent in NACK or a normal sequenced one
            if (diff >= 1) {
                this.lastSequenceNumber = dataPacket.sequenceNumber;
            }

            // Handle encapsulated
            // This is an array but soon
            // will be converted to a porperty
            // because there is alway one packet
            for (const packet of dataPacket.packets) {
                await this.receivePacket(packet);
            }

            resolve();
        });
    }

    // Handles a ACK packet, this packet confirm that the other
    // end successfully received the datagram
    public async handleACK(buffer: Buffer): Promise<void> {
        return new Promise((resolve) => {
            const packet = new ACK(buffer);
            packet.decode();

            // TODO: ping calculation

            packet
                .getPackets()
                .filter((seq) => this.recoveryQueue.has(seq))
                .map((seq) => this.recoveryQueue.delete(seq));

            resolve();
        });
    }

    public async handleNACK(buffer: Buffer): Promise<void> {
        return new Promise(async (resolve) => {
            const packet = new NACK(buffer);
            packet.decode();

            await Promise.all(
                packet
                    .getPackets()
                    .filter((seq) => this.recoveryQueue.has(seq))
                    .map(async (seq) => {
                        const pk = this.recoveryQueue.get(seq) as DataPacket;
                        pk.sequenceNumber = this.sendSequenceNumber++;
                        pk.sendTime = Date.now();
                        pk.encode();
                        await this.sendPacket(pk);
                        this.recoveryQueue.delete(seq);
                    })
            );

            resolve();
        });
    }

    public async receivePacket(packet: EncapsulatedPacket): Promise<void> {
        if (!isReliable(packet.reliability)) {
            // Handle the packet directly if it doesn't have a message index
            await this.handlePacket(packet);
        } else {
            // TODO: Restore out of order packets first
            const holeCount = this.lastReliableIndex - packet.messageIndex;
            // Console.log('[RAKNET] Waiting on reliableMessageIndex=%d missingDiff=%d datagramNumber=%d', packet.messageIndex, holeCount, this.lastSequenceNumber);

            if (holeCount === 0) {
                await this.handlePacket(packet);
                this.lastReliableIndex++;
            }
        }
    }

    public async addEncapsulatedToQueue(
        packet: EncapsulatedPacket,
        flags = Priority.NORMAL
    ) {
        if (isReliable(packet.reliability)) {
            packet.messageIndex = this.messageIndex++;

            if (packet.reliability === PacketReliability.RELIABLE_ORDERED) {
                packet.orderIndex = this.channelIndex[packet.orderChannel]++;
            }
        }

        // Split packet if bigger than MTU size
        if (packet.getByteLength() > this.mtuSize) {
            // Split the buffer into chunks
            const buffers: Map<number, Buffer> = new Map();
            let index = 0;
            let splitIndex = 0;

            while (index < packet.buffer.length) {
                // Push format: [chunk index: int, chunk: buffer]
                buffers.set(
                    splitIndex++,
                    packet.buffer.slice(index, (index += this.mtuSize))
                );
            }

            for (const [index, buffer] of buffers) {
                const pk = new EncapsulatedPacket();
                pk.splitId = this.splitId;
                pk.splitCount = buffers.size;
                pk.reliability = packet.reliability;
                pk.splitIndex = index;
                pk.buffer = buffer;

                if (index !== 0) {
                    pk.messageIndex = this.messageIndex++;
                }

                // Figure out if the message index differs
                // from 0 with reliable as reliability
                // pk.messageIndex = packet.messageIndex

                if (pk.reliability === PacketReliability.RELIABLE_ORDERED) {
                    pk.orderChannel = packet.orderChannel;
                    pk.orderIndex = packet.orderIndex;
                }

                await this.addToQueue(pk, flags);
            }

            // Increase the internal split Id
            this.splitId++;
        } else {
            await this.addToQueue(packet, flags);
        }
    }

    /**
     * Adds a packet into the queue
     */
    public async addToQueue(pk: EncapsulatedPacket, flags = Priority.NORMAL) {
        const priority = flags & 0b1;
        if (priority === Priority.IMMEDIATE) {
            const packet = new DataPacket();
            packet.sequenceNumber = this.sendSequenceNumber++;
            packet.packets.push(pk);
            await this.sendPacket(packet);
            packet.sendTime = Date.now();
            this.recoveryQueue.set(packet.sequenceNumber, packet);
            return;
        }

        const length = this.sendQueue.getLength();
        if (length + pk.getByteLength() > this.mtuSize) {
            await this.sendPacketQueue();
        }

        this.sendQueue.packets.push(pk);
    }

    /**
     * Encapsulated handling route
     */
    public async handlePacket(packet: EncapsulatedPacket): Promise<void> {
        return new Promise(async (resolve) => {
            if (packet.splitCount > 0) {
                await this.handleSplit(packet);
                return resolve();
            }

            const id = packet.buffer.readUInt8();

            if (id < 0x80) {
                if (this.state === Status.CONNECTING) {
                    if (id === Identifiers.ConnectionRequestAccepted) {
                        const dataPacket = new ConnectionRequestAccepted(
                            packet.buffer
                        );
                        dataPacket.decode();

                        const pk = new NewIncomingConnection();
                        pk.requestTimestamp = BigInt(Date.now());
                        pk.acceptedTimestamp = BigInt(Date.now());
                        pk.address = dataPacket.clientAddress;
                        pk.encode();

                        const sendPk = new EncapsulatedPacket();
                        sendPk.reliability = 0;
                        sendPk.buffer = pk.getBuffer();

                        await this.addToQueue(sendPk, Priority.IMMEDIATE);
                    } else if (id === Identifiers.ConnectionRequest) {
                        const encapsulated = await this.handleConnectionRequest(
                            packet.buffer
                        );
                        await this.addToQueue(encapsulated, Priority.IMMEDIATE);
                    } else if (id === Identifiers.NewIncomingConnection) {
                        const dataPacket = new NewIncomingConnection(
                            packet.buffer
                        );
                        dataPacket.decode();

                        // Client bots will work just in offline mode
                        const offlineMode = false; // TODO: from config

                        const serverPort = this.listener.getSocket().address()
                            .port;
                        if (
                            !offlineMode ??
                            dataPacket.address.getPort() === serverPort
                        ) {
                            this.state = Status.CONNECTED;
                            this.listener.emit('openConnection', this);
                        }
                    }
                } else if (id === Identifiers.DisconnectNotification) {
                    this.disconnect('client disconnect');
                } else if (id === Identifiers.ConnectedPing) {
                    const encapsulated = await this.handleConnectedPing(
                        packet.buffer
                    );
                    await this.addToQueue(encapsulated);
                }
            } else if (this.state === Status.CONNECTED) {
                this.listener.emit('encapsulated', packet, this.address); // To fit in software needs later
            }

            resolve();
        });
    }

    // Async encapsulated handlers
    public async handleConnectionRequest(
        buffer: Buffer
    ): Promise<EncapsulatedPacket> {
        return new Promise((resolve) => {
            const dataPacket = new ConnectionRequest(buffer);
            dataPacket.decode();

            const pk = new ConnectionRequestAccepted();
            pk.clientAddress = this.address;
            pk.requestTimestamp = dataPacket.requestTimestamp;
            pk.acceptedTimestamp = BigInt(Date.now());
            pk.encode();

            const sendPacket = new EncapsulatedPacket();
            sendPacket.reliability = 0;
            sendPacket.buffer = pk.getBuffer();

            resolve(sendPacket);
        });
    }

    public async handleConnectedPing(
        buffer: Buffer
    ): Promise<EncapsulatedPacket> {
        return new Promise((resolve) => {
            const dataPacket = new ConnectedPing(buffer);
            dataPacket.decode();

            const pk = new ConnectedPong();
            pk.clientTimestamp = dataPacket.clientTimestamp;
            pk.serverTimestamp = BigInt(Date.now());
            pk.encode();

            const sendPacket = new EncapsulatedPacket();
            sendPacket.reliability = 0;
            sendPacket.buffer = pk.getBuffer();

            resolve(sendPacket);
        });
    }

    /**
     * Handles a splitted packet.
     */
    public async handleSplit(packet: EncapsulatedPacket): Promise<void> {
        if (this.splitPackets.has(packet.splitId)) {
            const value = this.splitPackets.get(packet.splitId) as Map<
                number,
                EncapsulatedPacket
            >;
            value.set(packet.splitIndex, packet);
            this.splitPackets.set(packet.splitId, value);
        } else {
            this.splitPackets.set(
                packet.splitId,
                new Map([[packet.splitIndex, packet]])
            );
        }

        // If we have all pieces, put them together
        const localSplits = this.splitPackets.get(packet.splitId) as Map<
            number,
            EncapsulatedPacket
        >;
        if (localSplits.size === packet.splitCount) {
            const pk = new EncapsulatedPacket();
            const stream = new BinaryStream();
            Array.from(localSplits.values()).map((packet) =>
                stream.append(packet.buffer)
            );
            this.splitPackets.delete(packet.splitId);

            pk.buffer = stream.getBuffer();
            await this.receivePacket(pk);
        }
    }

    public async sendPacketQueue(): Promise<void> {
        if (this.sendQueue.packets.length > 0) {
            this.sendQueue.sequenceNumber = this.sendSequenceNumber++;
            await this.sendPacket(this.sendQueue);
            this.sendQueue.sendTime = Date.now();
            this.recoveryQueue.set(
                this.sendQueue.sequenceNumber,
                this.sendQueue
            );
            this.sendQueue = new DataPacket();
        }
    }

    public async sendPacket(packet: Packet): Promise<void> {
        packet.encode();

        // TODO: make awaitable
        this.listener.sendBuffer(
            packet.getBuffer(),
            this.address.getAddress(),
            this.address.getPort()
        );
    }

    public async close() {
        const stream = new BinaryStream(
            Buffer.from('\u0000\u0000\u0008\u0015', 'binary')
        );
        await this.addEncapsulatedToQueue(
            EncapsulatedPacket.fromBinary(stream),
            Priority.IMMEDIATE
        ); // Client discconect packet 0x15
    }

    public getState(): number {
        return this.state;
    }

    public isActive(): boolean {
        return this.active;
    }

    public getListener(): RakNetListener {
        return this.listener;
    }

    public getAddress(): InetAddress {
        return this.address;
    }
}
