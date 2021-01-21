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

    private offlineMode: boolean;

    // Map holding splits of split packets
    private readonly splitPackets: Map<number, Map<number, EncapsulatedPacket>> = new Map();

    // Map holding out of order reliable packets
    // private reliableMissing: Map<number, EncapsulatedPacket> = new Map();
    // Equivalent to recivedPacketBaseIndex in official RakNet
    // used to check if a reliable packet is out of order
    private lastReliableIndex = 0;

    // Array containing received sequence numbers
    private readonly receivedSeqNumbers: Set<number> = new Set();
    // Last received sequence number
    private lastSequenceNumber = -1;
    private sendSequenceNumber = 0;

    // Used just for reliable messages
    private sendReliableIndex = 0;
    // private readonly receivedReliableQueue: Map<number, EncapsulatedPacket> = new Map();

    private readonly channelIndex: number[] = [];

    // Internal split Id
    private splitId = 0;

    // Last timestamp of packet received, helpful for timeout
    private lastUpdate: number = Date.now();
    private active = false;

    public constructor(
        listener: RakNetListener,
        mtuSize: number,
        address: InetAddress,
        offlineMode = false
    ) {
        this.listener = listener;
        this.mtuSize = mtuSize;
        this.address = address;
        this.offlineMode = offlineMode;

        this.lastUpdate = Date.now();

        for (let i = 0; i < 32; i++) {
            this.channelIndex[i] = 0;
        }
    }

    public getSendQueue() {
        return this.sendQueue;
    }

    public async update(timestamp: number): Promise<void> {
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
        const dataPacket = new DataPacket(buffer);
        dataPacket.decode();

        // Check if we already received packet and so we don't handle them
        if (this.receivedSeqNumbers.has(dataPacket.sequenceNumber)) {
            return;
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
        this.receivedSeqNumbers.add(dataPacket.sequenceNumber);

        // Check if there are missing packets between the received packet and the last received one
        const diff = dataPacket.sequenceNumber - this.lastSequenceNumber;

        // Check if the sequence has a hole due to a lost packet
        if (diff !== 1) {
            // As i said before, there we search for missing packets in the list of the recieved ones
            for (let i = this.lastSequenceNumber + 1; i < dataPacket.sequenceNumber; i++) {
                // Adding the packet sequence number to the NACK queue and then sending a NACK
                // will make the Client sending again the lost packet
                if (!this.receivedSeqNumbers.has(i)) {
                    this.nackQueue.add(i);
                }
            }
        }

        // If we received a lost packet we sent in NACK or a normal sequenced one
        this.lastSequenceNumber = dataPacket.sequenceNumber;

        // Handle encapsulated
        for (const packet of dataPacket.packets) {
            await this.receivePacket(packet);
        }
    }

    // Handles a ACK packet, this packet confirm that the other
    // end successfully received the datagram
    public async handleACK(buffer: Buffer): Promise<void> {
        const packet = new ACK(buffer);
        packet.decode();

        // TODO: ping calculation

        await Promise.all(
            packet
                .getPackets()
                .filter((seq) => this.recoveryQueue.has(seq))
                .map((seq) => this.recoveryQueue.delete(seq))
        );
    }

    public async handleNACK(buffer: Buffer): Promise<void> {
        const packet = new NACK(buffer);
        packet.decode();

        await Promise.all(
            packet
                .getPackets()
                .filter((seq) => this.recoveryQueue.has(seq))
                .map(async (seq) => {
                    const pk = this.recoveryQueue.get(seq)!;
                    pk.sequenceNumber = this.sendSequenceNumber++;
                    pk.sendTime = Date.now();
                    pk.encode();
                    await this.sendPacket(pk);
                    this.recoveryQueue.delete(seq);
                })
        );
    }

    public async receivePacket(packet: EncapsulatedPacket): Promise<void> {
        if (!isReliable(packet.reliability)) {
            // Handle the packet directly if it doesn't have a message index
            await this.handlePacket(packet);
        } else {
            const holeCount = this.lastReliableIndex - packet.messageIndex;
            // console.log('[RAKNET] Waiting on reliableMessageIndex=%d missingDiff=%d datagramNumber=%d', packet.messageIndex, holeCount, this.lastSequenceNumber);

            if (holeCount === 0) {
                await this.handlePacket(packet);
                this.lastReliableIndex++;

                // TODO: Handle the out of order reliable packets
                // this.receivedReliableQueue.forEach(async (encapsualted) => {
                //    if ((encapsualted.messageIndex - this.lastReliableIndex) != 1) {
                //        return false;
                //    }
                //    await this.handlePacket(encapsualted);
                //    console.log(encapsualted.messageIndex)
                //    this.lastReliableIndex++;
                // });
                // this.receivedReliableQueue.clear();
            }

            // Hold in a queue out of order reliable messages
            // this.receivedReliableQueue.set(packet.messageIndex, packet);
        }
    }

    public async addEncapsulatedToQueue(packet: EncapsulatedPacket, flags = Priority.NORMAL) {
        if (isReliable(packet.reliability)) {
            packet.messageIndex = this.sendReliableIndex++;

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
                buffers.set(splitIndex++, packet.buffer.slice(index, (index += this.mtuSize)));
            }

            for (const [index, buffer] of buffers) {
                const pk = new EncapsulatedPacket();
                pk.splitId = this.splitId;
                pk.splitCount = buffers.size;
                pk.reliability = packet.reliability;
                pk.splitIndex = index;
                pk.buffer = buffer;

                if (index !== 0) {
                    pk.messageIndex = this.sendReliableIndex++;
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
        if (packet.splitCount > 0) {
            await this.handleSplit(packet);
            return;
        }

        const id = packet.buffer.readUInt8();

        if (id < 0x80) {
            if (this.state === Status.CONNECTING) {
                if (id === Identifiers.ConnectionRequestAccepted) {
                    const dataPacket = new ConnectionRequestAccepted(packet.buffer);
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
                    const encapsulated = await this.handleConnectionRequest(packet.buffer);
                    await this.addToQueue(encapsulated, Priority.IMMEDIATE);
                } else if (id === Identifiers.NewIncomingConnection) {
                    const dataPacket = new NewIncomingConnection(packet.buffer);
                    dataPacket.decode();

                    // Client bots will work just in offline mode
                    const offlineMode = this.offlineMode;

                    const serverPort = this.listener.getSocket().address().port;
                    if (!offlineMode ?? dataPacket.address.getPort() === serverPort) {
                        this.state = Status.CONNECTED;
                        this.listener.emit('openConnection', this);
                    }
                }
            } else if (id === Identifiers.DisconnectNotification) {
                this.disconnect('client disconnect');
            } else if (id === Identifiers.ConnectedPing) {
                const encapsulated = await this.handleConnectedPing(packet.buffer);
                await this.addToQueue(encapsulated);
            }
        } else if (this.state === Status.CONNECTED) {
            this.listener.emit('encapsulated', packet, this.address); // To fit in software needs later
        }
    }

    // Async encapsulated handlers
    public async handleConnectionRequest(buffer: Buffer): Promise<EncapsulatedPacket> {
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

        return sendPacket;
    }

    public async handleConnectedPing(buffer: Buffer): Promise<EncapsulatedPacket> {
        const dataPacket = new ConnectedPing(buffer);
        dataPacket.decode();

        const pk = new ConnectedPong();
        pk.clientTimestamp = dataPacket.clientTimestamp;
        pk.serverTimestamp = BigInt(Date.now());
        pk.encode();

        const sendPacket = new EncapsulatedPacket();
        sendPacket.reliability = 0;
        sendPacket.buffer = pk.getBuffer();

        return sendPacket;
    }

    /**
     * Handles a splitted packet.
     */
    public async handleSplit(packet: EncapsulatedPacket): Promise<void> {
        if (this.splitPackets.has(packet.splitId)) {
            const value = this.splitPackets.get(packet.splitId)!;
            value.set(packet.splitIndex, packet);
            this.splitPackets.set(packet.splitId, value);
        } else {
            this.splitPackets.set(packet.splitId, new Map([[packet.splitIndex, packet]]));
        }

        // If we have all pieces, put them together
        const localSplits = this.splitPackets.get(packet.splitId)!;
        if (localSplits.size === packet.splitCount) {
            const pk = new EncapsulatedPacket();
            const stream = new BinaryStream();
            Array.from(localSplits.values()).forEach((packet) => {
                stream.append(packet.buffer);
            });
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
            this.recoveryQueue.set(this.sendQueue.sequenceNumber, this.sendQueue);
            this.sendQueue = new DataPacket();
        }
    }

    public async sendPacket(packet: Packet): Promise<void> {
        packet.encode();

        await this.listener.sendBuffer(
            packet.getBuffer(),
            this.address.getAddress(),
            this.address.getPort()
        );
    }

    public async close() {
        const stream = new BinaryStream(Buffer.from('\u0000\u0000\u0008\u0015', 'binary'));
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
