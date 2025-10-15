import BinaryStream from '@jsprismarine/jsbinaryutils';
import assert from 'node:assert';
import { MAX_CHANNELS, UDP_HEADER_SIZE } from './Constants';
import ACK from './protocol/ACK';
import BitFlags from './protocol/BitFlags';
import Frame, { MAX_FRAME_BYTE_LENGTH } from './protocol/Frame';
import FrameReliability from './protocol/FrameReliability';
import FrameSet, { DATAGRAM_HEADER_BYTE_LENGTH } from './protocol/FrameSet';
import { MessageIdentifiers } from './protocol/MessageIdentifiers';
import NACK from './protocol/NACK';
import PacketPool from './protocol/PacketPool';
import ConnectedPing from './protocol/connection/ConnectedPing';
import ConnectedPong from './protocol/connection/ConnectedPong';
import ConnectionRequest from './protocol/login/ConnectionRequest';
import ConnectionRequestAccepted from './protocol/login/ConnectionRequestAccepted';
import InetAddress from './utils/InetAddress';

import type { RemoteInfo } from 'node:dgram';
import type RakNetListener from './ServerSocket';
import type Packet from './protocol/Packet';

export enum RakNetPriority {
    NORMAL,
    IMMEDIATE
}

export enum SessionStatus {
    CONNECTING,
    CONNECTED,
    DISCONNECTING,
    DISCONNECTED
}

export default class Session {
    private state = SessionStatus.CONNECTING;

    private outputFrameQueue = new FrameSet();
    private outputSequenceNumber = 0; // TODO: find a better name
    private outputReliableIndex = 0;
    private readonly outputBackupQueue: Map<number, Frame[]> = new Map();

    private readonly outputOrderIndex: number[];
    private readonly outputSequenceIndex: number[];

    private receivedFrameSequences: Set<number> = new Set();
    private lostFrameSequences: Set<number> = new Set();

    // Map holding fragments of fragmented packets
    private readonly fragmentsQueue: Map<number, Map<number, Frame>> = new Map();
    private outputFragmentIndex = 0;

    private lastInputSequenceNumber = -1;
    private readonly inputHighestSequenceIndex: number[];
    private readonly inputOrderIndex: number[];
    private inputOrderingQueue: Map<number, Map<number, Frame>> = new Map();

    // Last timestamp of packet received, helpful for timeout
    private lastUpdate: number = Date.now();
    private active = true;

    // Packet pool is the best option to reduce allocations
    private readonly packetPool = new PacketPool();

    public constructor(
        private readonly listener: RakNetListener,
        private readonly mtuSize: number,
        public readonly rinfo: RemoteInfo,
        public readonly guid: bigint
    ) {
        this.lastUpdate = Date.now();

        this.outputOrderIndex = new Array(MAX_CHANNELS).fill(0);
        this.outputSequenceIndex = new Array(MAX_CHANNELS).fill(0);

        this.inputOrderIndex = new Array(MAX_CHANNELS).fill(0);
        for (let i = 0; i < MAX_CHANNELS; i++) {
            this.inputOrderingQueue.set(i, new Map());
        }

        this.inputHighestSequenceIndex = new Array(MAX_CHANNELS).fill(0);
    }

    // Lookup table for packet handlers, always O(1) in average and worst case
    private readonly packetHandlers: Record<number, (buffer: Buffer) => void> = {
        // 0x40 | 0xc0 = MessageHeaders.ACKNOWLEDGE_PACKET
        [MessageIdentifiers.ACKNOWLEDGE_PACKET]: (buffer: Buffer) => {
            const ack = this.packetPool.getAckInstance();
            (ack as any).buffer = buffer;
            ack.decode();
            this.handleACK(ack);
        },
        [MessageIdentifiers.NACKNOWLEDGE_PACKET]: (buffer: Buffer) => {
            const nack = this.packetPool.getNackInstance();
            (nack as any).buffer = buffer;
            nack.decode();
            this.handleNACK(nack);
        },
        [BitFlags.VALID]: (buffer: Buffer) => {
            const frameSet = this.packetPool.getFrameSetInstance();
            (frameSet as any).buffer = buffer;
            frameSet.decode();
            this.handleFrameSet(frameSet);
        }
    };

    public update(timestamp: number): void {
        if (!this.isActive() && !this.isDisconnected() && this.lastUpdate + 10_000 < timestamp) {
            this.disconnect('timeout');
            return;
        }

        this.active = false;

        // TODO: a queue just for ACKs sequences to avoid duplicateds
        if (this.receivedFrameSequences.size > 0) {
            const ack = new ACK();
            ack.sequenceNumbers = Array.from(this.receivedFrameSequences).map((seq) => {
                this.receivedFrameSequences.delete(seq);
                return seq;
            });
            this.sendPacket(ack);
        }

        if (this.lostFrameSequences.size > 0) {
            const pk = new NACK();
            pk.sequenceNumbers = Array.from(this.lostFrameSequences).map((seq) => {
                this.lostFrameSequences.delete(seq);
                return seq;
            });
            this.sendPacket(pk);
        }

        this.sendFrameQueue();
    }

    // https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/ReliabilityLayer.cpp#L635
    public handle(buffer: Buffer): void {
        this.active = true;
        this.lastUpdate = Date.now();

        // Mask the lower 4 bits of the header
        // to get the range of header values
        const handler = this.packetHandlers[buffer[0]! & 0xf0];
        if (handler) {
            handler(buffer);
        } else {
            this.listener.getLogger().verbose(`Received an unknown packet type=${buffer[0]}`);
        }
    }

    private handleFrameSet(frameSet: FrameSet): void {
        // TODO: additional sanity checks
        if (this.receivedFrameSequences.has(frameSet.sequenceNumber)) {
            this.listener.getLogger().debug(`Discarded duplicated packet from client=${this.getAddress()}`);
            return;
        }

        // if it was missing, remove from the queue because we received it now
        this.lostFrameSequences.delete(frameSet.sequenceNumber);

        // For now is good like that
        if (
            frameSet.sequenceNumber < this.lastInputSequenceNumber ||
            frameSet.sequenceNumber === this.lastInputSequenceNumber
        ) {
            return;
        }

        // Add the frame to the ACK queue
        this.receivedFrameSequences.add(frameSet.sequenceNumber);

        // Check if there are missing packets between the received packet and the last received one
        const diff = frameSet.sequenceNumber - this.lastInputSequenceNumber;

        // Check if the sequence has a hole due to a lost packet
        if (diff !== 1) {
            // As i said before, there we search for missing packets in the list of the recieved ones
            for (let i = this.lastInputSequenceNumber + 1; i < frameSet.sequenceNumber; i++) {
                // Adding the packet sequence number to the NACK queue and then sending a NACK
                // will make the Client sending again the lost packet
                if (!this.receivedFrameSequences.has(i)) {
                    this.lostFrameSequences.add(i);
                }
            }
        }

        // If we received a lost packet we sent in NACK or a normal sequenced one
        this.lastInputSequenceNumber = frameSet.sequenceNumber;

        // Handle encapsulated
        for (const frame of frameSet.frames) {
            this.handleFrame(frame);
        }
    }

    private handleACK(ack: ACK): void {
        // TODO: ping calculation

        for (const seq of ack.sequenceNumbers) {
            this.outputBackupQueue.delete(seq);
        }
    }

    private handleNACK(nack: NACK): void {
        for (const seq of nack.sequenceNumbers) {
            if (this.outputBackupQueue.has(seq)) {
                const lostFrames = this.outputBackupQueue.get(seq)!;
                for (const lostFrame of lostFrames) {
                    this.sendFrame(lostFrame, RakNetPriority.IMMEDIATE);
                }
                this.outputBackupQueue.delete(seq);
            }
        }
    }

    private handleFrame(frame: Frame): void {
        if (frame.isFragmented()) {
            this.handleFragment(frame);
            return;
        }

        const orderChannel = frame.orderChannel!;
        const orderIndex = frame.orderIndex!;
        const sequenceIndex = frame.sequenceIndex!;

        if (frame.isSequenced()) {
            if (
                sequenceIndex < this.inputHighestSequenceIndex[orderChannel]! ||
                orderIndex < this.inputOrderIndex[orderChannel]!
            ) {
                // Sequenced packet is too old, discard it
                return;
            }

            this.inputHighestSequenceIndex[orderChannel] = sequenceIndex + 1;
            this.handlePacket(frame);
        } else if (frame.isOrdered()) {
            if (orderIndex === this.inputOrderIndex[orderChannel]) {
                this.inputHighestSequenceIndex[orderChannel] = 0;
                this.inputOrderIndex[orderChannel] = orderIndex + 1;

                this.handlePacket(frame);
                let i = this.inputOrderIndex[orderChannel]!;
                const outOfOrderQueue = this.inputOrderingQueue.get(orderChannel)!;
                for (; outOfOrderQueue.has(i); i++) {
                    this.handlePacket(outOfOrderQueue.get(i)!);
                    outOfOrderQueue.delete(i);
                }

                // Set the updated queue
                this.inputOrderingQueue.set(orderChannel, outOfOrderQueue);
                this.inputOrderIndex[orderChannel] = i;
            } else if (orderIndex > this.inputOrderIndex[orderChannel]!) {
                const unordered = this.inputOrderingQueue.get(orderChannel)!;
                unordered.set(orderIndex, frame);
            }
        } else {
            this.handlePacket(frame);
        }
    }

    public sendFrame(frame: Frame, flags = RakNetPriority.NORMAL): void {
        assert(typeof frame.orderChannel === 'number', 'Frame OrderChannel cannot be null');

        // https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/ReliabilityLayer.cpp#L1625
        if (frame.isSequenced()) {
            // Sequenced packets don't increase the ordered channel index
            frame.orderIndex = this.outputOrderIndex[frame.orderChannel]!;
            frame.sequenceIndex = this.outputSequenceIndex[frame.orderChannel]!++;
        } else if (frame.isOrderedExclusive()) {
            // implies sequenced, but we have to distinct them
            frame.orderIndex = this.outputOrderIndex[frame.orderChannel]!++;
            this.outputSequenceIndex[frame.orderChannel] = 0;
        }

        frame.reliableIndex = this.outputReliableIndex++;

        // Split packet if bigger than MTU size
        const maxSize = this.getMTU() - DATAGRAM_HEADER_BYTE_LENGTH - MAX_FRAME_BYTE_LENGTH;
        if (frame.content.byteLength > maxSize) {
            // If we use the frame as reference, we have to copy somewhere
            // the original buffer. Then we will point to this buffer content
            const buffer = Buffer.from(frame.content);
            const fragmentId = this.outputFragmentIndex++ % 65536;
            for (let i = 0; i < buffer.byteLength; i += maxSize) {
                // Like the original raknet, we like to use a pointer to the original
                // frame, we don't really care about side effects in this case.
                // RakNet will allocate the whole strcture containing splits,
                // but i think caching just the buffer is enough.
                // https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/ReliabilityLayer.cpp#L2963

                // Skip the first index as it's already increased by itself.
                if (i !== 0) {
                    frame.reliableIndex = this.outputReliableIndex++;
                }

                frame.content = buffer.slice(i, i + maxSize);
                frame.fragmentIndex = i / maxSize;
                frame.fragmentId = fragmentId;
                frame.fragmentSize = Math.ceil(buffer.byteLength / maxSize);
                this.addFrameToQueue(frame, flags | RakNetPriority.IMMEDIATE);
            }
        } else {
            this.addFrameToQueue(frame, flags);
        }
    }

    private addFrameToQueue(frame: Frame, priority = RakNetPriority.NORMAL): void {
        let length = 4; // datagram header size
        for (const queuedFrame of this.outputFrameQueue.frames) {
            length += queuedFrame.getByteLength();
        }

        if (length + frame.getByteLength() > this.mtuSize - 36) {
            this.sendFrameQueue();
        }

        this.outputFrameQueue.frames.push(frame);

        if (priority === RakNetPriority.IMMEDIATE) {
            this.sendFrameQueue();
        }
    }

    private handlePacket(packet: Frame): void {
        const id = packet.content[0];

        if (this.state === SessionStatus.CONNECTING) {
            if (id === MessageIdentifiers.CONNECTION_REQUEST) {
                this.handleConnectionRequest(packet.content).then(
                    (encapsulated) => this.sendFrame(encapsulated, RakNetPriority.IMMEDIATE),
                    () => {}
                );
            } else if (id === MessageIdentifiers.NEW_INCOMING_CONNECTION) {
                // TODO: online mode
                this.state = SessionStatus.CONNECTED;
                this.listener.emit('openConnection', this);
            }
        } else if (id === MessageIdentifiers.DISCONNECTION_NOTIFICATION) {
            this.disconnect();
        } else if (id === MessageIdentifiers.CONNECTED_PING) {
            this.handleConnectedPing(packet.content).then(
                (encapsulated) => this.sendFrame(encapsulated),
                () => {}
            );
        } else if (this.state === SessionStatus.CONNECTED) {
            this.listener.emit('encapsulated', packet, this.getAddress()); // To fit in software needs later
        }
    }

    public async handleConnectionRequest(buffer: Buffer): Promise<Frame> {
        const dataPacket = new ConnectionRequest(buffer);
        dataPacket.decode();

        const pk = new ConnectionRequestAccepted();
        pk.clientAddress = this.getAddress();
        pk.requestTimestamp = dataPacket.requestTimestamp;
        pk.acceptedTimestamp = BigInt(Date.now());
        pk.encode();

        const sendPacket = new Frame();
        sendPacket.reliability = FrameReliability.UNRELIABLE;
        sendPacket.orderChannel = 0;
        sendPacket.content = pk.getBuffer();

        return sendPacket;
    }

    public async handleConnectedPing(buffer: Buffer): Promise<Frame> {
        const dataPacket = new ConnectedPing(buffer);
        dataPacket.decode();

        const pk = new ConnectedPong();
        pk.clientTimestamp = dataPacket.clientTimestamp;
        pk.serverTimestamp = BigInt(Date.now());
        pk.encode();

        const sendPacket = new Frame();
        sendPacket.reliability = FrameReliability.UNRELIABLE;
        sendPacket.orderChannel = 0;
        sendPacket.content = pk.getBuffer();

        return sendPacket;
    }

    public handleFragment(frame: Frame): void {
        if (!this.fragmentsQueue.has(frame.fragmentId)) {
            this.fragmentsQueue.set(frame.fragmentId, new Map([[frame.fragmentIndex, frame]]));
        } else {
            const value = this.fragmentsQueue.get(frame.fragmentId)!;
            value.set(frame.fragmentIndex, frame);

            // If we have all pieces, put them together
            if (value.size === frame.fragmentSize) {
                const stream = new BinaryStream();
                // Ensure the correctness of the buffer orders
                for (let i = 0; i < value.size; i++) {
                    const splitPacket = value.get(i)!;
                    stream.write(splitPacket.content);
                }

                const assembledFrame = new Frame();
                assembledFrame.content = stream.getBuffer();

                assembledFrame.reliability = frame.reliability;
                assembledFrame.reliableIndex = frame.reliableIndex;
                assembledFrame.sequenceIndex = frame.sequenceIndex;
                assembledFrame.orderIndex = frame.orderIndex;
                assembledFrame.orderChannel = frame.orderChannel;

                this.fragmentsQueue.delete(frame.fragmentId);
                this.handleFrame(assembledFrame);
            }
        }
    }

    public sendFrameQueue(): void {
        if (this.outputFrameQueue.frames.length > 0) {
            this.outputFrameQueue.sequenceNumber = this.outputSequenceNumber++;
            this.sendFrameSet(this.outputFrameQueue);
            this.outputFrameQueue = new FrameSet();
        }
    }

    private sendFrameSet(frameSet: FrameSet): void {
        this.sendPacket(frameSet);
        this.outputBackupQueue.set(
            frameSet.sequenceNumber,
            frameSet.frames.filter((frame) => frame.isReliable())
        );
    }

    private sendPacket(packet: Packet): void {
        this.listener.sendPacket(packet, this.rinfo);
    }

    public close(): void {
        const stream = new BinaryStream(Buffer.from('\u0000\u0000\u0008\u0015', 'binary'));
        this.addFrameToQueue(new Frame().fromBinary(stream), RakNetPriority.IMMEDIATE); // Client discconect packet 0x15
    }

    /**
     * Kick a client
     * @param reason - the reason message, optional
     */
    public disconnect(reason = 'client disconnect'): void {
        // TODO: rewrite, works but can be improved
        this.close();
        // Send disconnect ACK
        this.state = SessionStatus.DISCONNECTED;
        this.update(Date.now());
        this.listener.removeSession(this, reason);
    }

    public getState(): number {
        return this.state;
    }

    public isActive(): boolean {
        return this.active;
    }

    public isDisconnected(): boolean {
        return this.state === SessionStatus.DISCONNECTED;
    }

    public getListener(): RakNetListener {
        return this.listener;
    }

    /**
     * Returns the maxmium transfer unit
     * for this connection.
     * @returns {number} the UDP adjusted.
     */
    public getMTU(): number {
        return this.mtuSize - UDP_HEADER_SIZE;
    }

    public getAddress(): InetAddress {
        return new InetAddress(this.rinfo.address, this.rinfo.port, 4);
    }
}
