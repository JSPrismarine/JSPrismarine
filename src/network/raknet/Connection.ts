import BinaryStream from '@jsprismarine/jsbinaryutils';
import DataPacket from './protocol/DataPacket';
import Listener from './Listener';
import ACK from './protocol/ACK';
import BitFlags from './protocol/BitFlags';
import ConnectedPing from './protocol/ConnectedPing';
import ConnectedPong from './protocol/ConnectedPong';
import ConnectionRequest from './protocol/ConnectionRequest';
import ConnectionRequestAccepted from './protocol/ConnectionRequestAccepted';
import EncapsulatedPacket from './protocol/EncapsulatedPacket';
import NACK from './protocol/NACK';
import NewIncomingConnection from './protocol/NewIncomingConnection';
import InetAddress from './utils/InetAddress';
import Identifiers from './protocol/Identifiers';
import Packet from './protocol/Packet';

enum Priority {
    NORMAL,
    IMMEDIATE
}

enum Status {
    CONNECTING,
    CONNECTED,
    DISCONNECTING,
    DISCONNECTED
}

export default class Connection {
    private listener: Listener;
    private mtuSize: number;
    private address: InetAddress;

    // Client connection state
    private state = Status.CONNECTING;

    // Queue containing sequence numbers of packets not received
    private nackQueue: Set<number> = new Set();
    // Queue containing sequence numbers to let know the game packets we sent
    private ackQueue: Set<number> = new Set();
    // Queue containing cached packets in case recovery is needed
    private recoveryQueue: Map<number, DataPacket> = new Map();
    // Need documentation
    private packetToSend: Set<DataPacket> = new Set();
    // Queue holding packets to send
    private sendQueue = new DataPacket();

    private splitPackets: Map<
        number,
        Map<number, EncapsulatedPacket>
    > = new Map();

    // Need documentation
    private windowStart = -1;
    private windowEnd = 2048;
    private reliableWindowStart = 0;
    private reliableWindowEnd = 2048;
    private reliableWindow = new Map();
    private lastReliableIndex = -1;

    // Array containing received sequence numbers
    private receivedWindow: Set<number> = new Set();
    // Last received sequence number
    private lastSequenceNumber = -1;
    private sendSequenceNumber = 0;

    private messageIndex = 0;
    private channelIndex: Array<number> = [];

    private splitId = 0;

    // Last timestamp of packet received, helpful for timeout
    private lastUpdate: number = Date.now();
    private active = false;

    constructor(listener: Listener, mtuSize: number, address: InetAddress) {
        this.listener = listener;
        this.mtuSize = mtuSize;
        this.address = address;

        this.lastUpdate = Date.now();

        for (let i = 0; i < 32; i++) {
            this.channelIndex[i] = 0;
        }
    }

    public async update(timestamp: number): Promise<void> {
        return await new Promise((resolve) => {
            if (!this.isActive() && this.lastUpdate + 10000 < timestamp) {
                this.disconnect('timeout');
                return;
            }
            this.active = false;

            if (this.ackQueue.size > 0) {
                const pk = new ACK();
                pk.setPackets(Array.from(this.ackQueue));
                this.sendPacket(pk);
                this.ackQueue.clear();
            }

            if (this.nackQueue.size > 0) {
                let pk = new NACK();
                pk.setPackets(Array.from(this.nackQueue));
                this.sendPacket(pk);
                this.nackQueue.clear();
            }

            if (this.packetToSend.size > 0) {
                let limit = 16;
                Promise.all(
                    Array.from(this.packetToSend).map((pk) => {
                        pk.sendTime = timestamp;
                        pk.encode();
                        this.recoveryQueue.set(pk.sequenceNumber, pk);
                        this.packetToSend.delete(pk);
                        this.sendPacket(pk);

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

            Promise.all(
                Array.from(this.recoveryQueue.entries()).map(([seq, pk]) => {
                    if (pk.sendTime < Date.now() - 8000) {
                        this.packetToSend.add(pk);
                        this.recoveryQueue.delete(seq);
                    }
                })
            );

            Promise.all(
                Array.from(this.receivedWindow).map((seq) => {
                    if (seq < this.windowStart) {
                        this.receivedWindow.delete(seq);
                    } else {
                        return false;
                    }
                })
            );

            this.sendPacketQueue();

            resolve();
        });

        // console.log(`Update took ${resolveTime - startTime}ms to complete`);
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
        let header = buffer.readUInt8();

        if ((header & BitFlags.VALID) == 0) {
            // Don't handle offline packets
            return;
        } else if (header & BitFlags.ACK) {
            return await this.handleACK(buffer);
        } else if (header & BitFlags.NACK) {
            return await this.handleNACK(buffer);
        } else {
            return await this.handleDatagram(buffer);
        }
    }

    public async handleDatagram(buffer: Buffer): Promise<void> {
        return await new Promise(async (resolve) => {
            const dataPacket = new DataPacket(buffer);
            dataPacket.decode();

            // Check if we already received packet and so we don't handle them
            // i still need to understand what are those window stuff
            if (
                dataPacket.sequenceNumber < this.windowStart ||
                dataPacket.sequenceNumber > this.windowEnd ||
                this.receivedWindow.has(dataPacket.sequenceNumber)
            ) {
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
            // needs more documentation for window start and end
            if (diff >= 1) {
                this.lastSequenceNumber = dataPacket.sequenceNumber;
                this.windowStart += diff;
                this.windowEnd += diff;
            }

            // Handle encapsulated
            // This is an array but soon
            // will be converted to a porperty
            // because there is alway one packet
            for (const packet of dataPacket.packets) {
                this.receivePacket(packet);
            }

            resolve();
        });
    }

    // Handles a ACK packet, this packet confirm that the other
    // end successfully received the datagram
    public async handleACK(buffer: Buffer): Promise<void> {
        return await new Promise((resolve) => {
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
        return await new Promise(async (resolve) => {
            const packet = new NACK(buffer);
            packet.decode();

            await Promise.all(
                packet
                    .getPackets()
                    .filter((seq) => this.recoveryQueue.has(seq))
                    .map((seq) => {
                        let pk = this.recoveryQueue.get(seq) as DataPacket;
                        pk.sequenceNumber = this.sendSequenceNumber++;
                        pk.sendTime = Date.now();
                        pk.encode();
                        this.sendPacket(pk);
                        this.recoveryQueue.delete(seq);
                    })
            );

            resolve();
        });
    }

    public async receivePacket(packet: EncapsulatedPacket): Promise<void> {
        return await new Promise(async (resolve) => {
            if (typeof packet.messageIndex === 'undefined') {
                // Handle the packet directly if it doesn't have a message index
                this.handlePacket(packet);
            } else {
                // Seems like we are checking the same stuff like before
                // but just with reliable packets
                if (
                    packet.messageIndex < this.reliableWindowStart ||
                    packet.messageIndex > this.reliableWindowEnd
                ) {
                    return resolve();
                }

                if (packet.messageIndex - this.lastReliableIndex === 1) {
                    this.lastReliableIndex++;
                    this.reliableWindowStart++;
                    this.reliableWindowEnd++;
                    await this.handlePacket(packet);

                    if (this.reliableWindow.size > 0) {
                        let windows = [...this.reliableWindow.entries()];
                        let reliableWindow = new Map();
                        windows.sort((a, b) => a[0] - b[0]);

                        for (const [k, v] of windows) {
                            reliableWindow.set(k, v);
                        }

                        this.reliableWindow = reliableWindow;

                        for (let [seqIndex, pk] of this.reliableWindow) {
                            if (seqIndex - this.lastReliableIndex !== 1) {
                                break;
                            }
                            this.lastReliableIndex++;
                            this.reliableWindowStart++;
                            this.reliableWindowEnd++;
                            this.handlePacket(pk);

                            this.reliableWindow.delete(seqIndex);
                        }
                    }
                } else {
                    this.reliableWindow.set(packet.messageIndex, packet);
                }
            }

            resolve();
        });
    }

    public addEncapsulatedToQueue(
        packet: EncapsulatedPacket,
        flags = Priority.NORMAL
    ) {
        if (
            packet.reliability === 2 ||
            packet.reliability === 3 ||
            packet.reliability === 4 ||
            packet.reliability === 6 ||
            packet.reliability === 7
        ) {
            packet.messageIndex = this.messageIndex++;

            if (packet.reliability === 3) {
                packet.orderIndex = this.channelIndex[packet.orderChannel]++;
            }
        }

        if (packet.getTotalLength() + 4 > this.mtuSize) {
            // Split the buffer into chunks
            let buffers = [],
                i = 0,
                splitIndex = 0;
            while (i < packet.buffer.length) {
                // Push format: [chunk index: int, chunk: buffer]
                buffers.push([
                    (splitIndex += 1) - 1,
                    packet.buffer.slice(i, (i += this.mtuSize - 60))
                ]);
            }
            let splitID = ++this.splitId % 65536;
            for (let [count, buffer] of buffers) {
                let pk = new EncapsulatedPacket();
                pk.splitId = splitID;
                pk.splitCount = buffers.length;
                pk.reliability = packet.reliability;
                pk.splitIndex = count as number;
                pk.buffer = buffer as Buffer;
                if (count > 0) {
                    pk.messageIndex = this.messageIndex++;
                } else {
                    pk.messageIndex = packet.messageIndex;
                }
                if (pk.reliability === 3) {
                    pk.orderChannel = packet.orderChannel;
                    pk.orderIndex = packet.orderIndex;
                }
                this.addToQueue(pk, flags | Priority.IMMEDIATE);
            }
        } else {
            this.addToQueue(packet, flags);
        }
    }

    /**
     * Adds a packet into the queue
     */
    public addToQueue(pk: EncapsulatedPacket, flags = Priority.NORMAL) {
        let priority = flags & 0b1;
        if (priority === Priority.IMMEDIATE) {
            let packet = new DataPacket();
            packet.sequenceNumber = this.sendSequenceNumber++;
            packet.packets.push(pk);
            this.sendPacket(packet);
            packet.sendTime = Date.now();
            this.recoveryQueue.set(packet.sequenceNumber, packet);
            return;
        }
        let length = this.sendQueue.getLength();
        if (length + pk.getTotalLength() > this.mtuSize) {
            this.sendPacketQueue();
        }

        this.sendQueue.packets.push(pk);
    }

    /**
     * Encapsulated handling route
     */
    public async handlePacket(packet: EncapsulatedPacket): Promise<void> {
        return await new Promise((resolve) => {
            if (packet.splitCount > 0) {
                this.handleSplit(packet);
                return resolve();
            }

            const id = packet.buffer.readUInt8();

            if (id < 0x80) {
                if (this.state === Status.CONNECTING) {
                    if (id === Identifiers.ConnectionRequest) {
                        this.handleConnectionRequest(packet.buffer).then(
                            (encapsulated) => {
                                this.addToQueue(
                                    encapsulated,
                                    Priority.IMMEDIATE
                                );
                            }
                        );
                    } else if (id === Identifiers.NewIncomingConnection) {
                        const dataPacket = new NewIncomingConnection(
                            packet.buffer
                        );
                        dataPacket.decode();

                        let serverPort = this.listener.getSocket().address()
                            .port;
                        if (dataPacket.address.getPort() === serverPort) {
                            this.state = Status.CONNECTED;
                            this.listener.emit('openConnection', this);
                        }
                    }
                } else if (id === Identifiers.DisconnectNotification) {
                    this.disconnect('client disconnect');
                } else if (id === Identifiers.ConnectedPing) {
                    this.handleConnectedPing(packet.buffer).then(
                        (encapsulated) => {
                            this.addToQueue(encapsulated);
                        }
                    );
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
        return await new Promise((resolve) => {
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
        return await new Promise((resolve) => {
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
    public handleSplit(packet: EncapsulatedPacket): void {
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
            this.receivePacket(pk);
        }
    }

    public sendPacketQueue(): void {
        if (this.sendQueue.packets.length > 0) {
            this.sendQueue.sequenceNumber = this.sendSequenceNumber++;
            this.sendPacket(this.sendQueue);
            this.sendQueue.sendTime = Date.now();
            this.recoveryQueue.set(
                this.sendQueue.sequenceNumber,
                this.sendQueue
            );
            this.sendQueue = new DataPacket();
        }
    }

    public sendPacket(packet: Packet): void {
        packet.encode();
        this.listener.sendBuffer(
            packet.getBuffer(),
            this.address.getAddress(),
            this.address.getPort()
        );
    }

    close() {
        let stream = new BinaryStream(
            Buffer.from('\x00\x00\x08\x15', 'binary')
        );
        this.addEncapsulatedToQueue(
            EncapsulatedPacket.fromBinary(stream),
            Priority.IMMEDIATE
        ); // Client discconect packet 0x15
    }

    public isActive(): boolean {
        return this.active;
    }

    public getListener(): Listener {
        return this.listener;
    }

    public getAddress(): InetAddress {
        return this.address;
    }
}
