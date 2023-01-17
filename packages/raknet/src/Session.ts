import ACK from './protocol/ACK.js';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import BitFlags from './protocol/BitFlags.js';
import ConnectedPing from './protocol/connection/ConnectedPing.js';
import ConnectedPong from './protocol/connection/ConnectedPong.js';
import ConnectionRequest from './protocol/login/ConnectionRequest.js';
import ConnectionRequestAccepted from './protocol/login/ConnectionRequestAccepted.js';
import Frame from './protocol/Frame.js';
import FrameReliability from './protocol/FrameReliability.js';
import FrameSet from './protocol/FrameSet.js';
import InetAddress from './utils/InetAddress.js';
import { MAX_CHANNELS } from './RakNet.js';
import MessageHeaders from './protocol/MessageHeaders.js';
import NACK from './protocol/NACK.js';
import Packet from './protocol/Packet.js';
import RakNetListener from './Listener.js';
import { type RemoteInfo } from 'node:dgram';
import assert from 'node:assert';
import PacketPool from './protocol/PacketPool.js';

export enum RakNetPriority {
    NORMAL,
    IMMEDIATE
}

export enum RakNetStatus {
    CONNECTING,
    CONNECTED,
    DISCONNECTING,
    DISCONNECTED
}

export default class RakNetSession {
    private readonly listener: RakNetListener;
    private readonly mtuSize: number;
    protected readonly rinfo: RemoteInfo;

    private state = RakNetStatus.CONNECTING;

    private outputFrameQueue = new FrameSet();
    private outputSequenceNumber = 0;
    private outputReliableIndex = 0;
    private outputSequenceIndex = 0;
    private readonly outputBackupQueue: Map<number, Frame[]> = new Map();

    private receivedFrameSequences: Set<number> = new Set();
    private lostFrameSequences: Set<number> = new Set();

    // Map holding fragments of fragmented packets
    private readonly fragmentsQueue: Map<number, Map<number, Frame>> = new Map();
    private outputFragmentIndex = 0;

    private lastInputSequenceNumber = -1;
    private readonly inputHighestSequenceIndex: number[];
    private readonly inputOrderIndex: number[];
    private inputOrderingQueue: Map<number, Map<number, Frame>> = new Map();

    private readonly channelIndex: number[];

    // Last timestamp of packet received, helpful for timeout
    private lastUpdate: number = Date.now();
    private active = true;

    // Packet pool is the best option to reduce allocations
    private readonly packetPool = new PacketPool();

    public constructor(listener: RakNetListener, mtuSize: number, rinfo: RemoteInfo) {
        this.listener = listener;

        this.mtuSize = mtuSize;
        this.rinfo = rinfo;
        this.lastUpdate = Date.now();

        this.channelIndex = new Array(MAX_CHANNELS).fill(0);

        this.inputOrderIndex = new Array(MAX_CHANNELS).fill(0);
        for (let i = 0; i < MAX_CHANNELS; i++) {
            this.inputOrderingQueue.set(i, new Map());
        }

        this.inputHighestSequenceIndex = new Array(MAX_CHANNELS).fill(0);
    }

    // Lookup table for packet handlers, always O(1) in average and worst case
    private readonly packetHandlers: Record<number, (buffer: Buffer) => void> = {
        // 0x40 | 0xc0 = MessageHeaders.ACKNOWLEDGE_PACKET
        [MessageHeaders.ACKNOWLEDGE_PACKET]: (buffer: Buffer) => {
            const ack = this.packetPool.getAckInstance();
            (ack as any).buffer = buffer;
            ack.decode();
            this.handleACK(ack);
        },
        [MessageHeaders.NACKNOWLEDGE_PACKET]: (buffer: Buffer) => {
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

    public handle(buffer: Buffer): void {
        this.active = true;
        this.lastUpdate = Date.now();

        // Mask the lower 4 bits of the header
        // to get the range of header values
        const handler = this.packetHandlers[buffer[0] & 0xf0];
        if (handler) {
            handler(buffer);
        } else {
            this.listener.getLogger().debug('Received an unknown packet type=%d', buffer[0]);
        }
    }

    private handleFrameSet(frameSet: FrameSet): void {
        // TODO: additional sanity checks
        if (this.receivedFrameSequences.has(frameSet.sequenceNumber)) {
            this.listener.getLogger().debug('Discarded duplicated packet from client=%o', this.getAddress());
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
                sequenceIndex < this.inputHighestSequenceIndex[orderChannel] ||
                orderIndex < this.inputOrderIndex[orderChannel]
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
                let i = this.inputOrderIndex[orderChannel];
                const outOfOrderQueue = this.inputOrderingQueue.get(orderChannel)!;
                for (; outOfOrderQueue.has(i); i++) {
                    this.handlePacket(outOfOrderQueue.get(i)!);
                    outOfOrderQueue.delete(i);
                }

                // Set the updated queue
                this.inputOrderingQueue.set(orderChannel, outOfOrderQueue);
                this.inputOrderIndex[orderChannel] = i;
            } else if (orderIndex > this.inputOrderIndex[orderChannel]) {
                const unordered = this.inputOrderingQueue.get(orderChannel)!;
                unordered.set(orderIndex, frame);
                this.inputOrderingQueue.set(orderChannel, unordered);
            }
        } else {
            this.handlePacket(frame);
        }
    }

    public sendFrame(frame: Frame, flags = RakNetPriority.NORMAL): void {
        assert(typeof frame.orderChannel === 'number', 'Frame OrderChannel cannot be null');
        if (frame.isSequenced()) {
            // Sequenced packets don't increase the ordered channel index
            frame.orderIndex = this.channelIndex[frame.orderChannel];
            frame.sequenceIndex = this.outputSequenceIndex++;
        } else if (frame.isOrdered()) {
            // implies sequenced, but we have to distinct them
            frame.orderIndex = this.channelIndex[frame.orderChannel]++;
        }

        // Split packet if bigger than MTU size
        const maxSize = this.mtuSize - 60;
        if (frame.content.byteLength > maxSize) {
            // Split the buffer into chunks
            const buffers: Map<number, Buffer> = new Map();
            let [index, splitIndex] = [0, 0];

            while (index < frame.content.byteLength) {
                // Push format: [chunk index: int, chunk: buffer]
                buffers.set(splitIndex++, frame.content.slice(index, (index += maxSize)));
            }

            const fragmentId = this.outputFragmentIndex++ % 65536;
            for (const [index, buffer] of buffers) {
                const newFrame = new Frame();
                newFrame.reliability = frame.reliability;
                newFrame.fragmentId = fragmentId;
                newFrame.fragmentSize = buffers.size;
                newFrame.fragmentIndex = index;
                newFrame.content = buffer;

                if (newFrame.isReliable()) {
                    newFrame.reliableIndex = this.outputReliableIndex++;
                }

                newFrame.sequenceIndex = frame.sequenceIndex;
                newFrame.orderChannel = frame.orderChannel;
                newFrame.orderIndex = frame.orderIndex;

                this.addFrameToQueue(newFrame, flags | RakNetPriority.IMMEDIATE);
            }
        } else {
            if (frame.isReliable()) {
                frame.reliableIndex = this.outputReliableIndex++;
            }
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

        if (this.state === RakNetStatus.CONNECTING) {
            if (id === MessageHeaders.CONNECTION_REQUEST) {
                this.handleConnectionRequest(packet.content).then(
                    (encapsulated) => this.sendFrame(encapsulated, RakNetPriority.IMMEDIATE),
                    () => {}
                );
            } else if (id === MessageHeaders.NEW_INCOMING_CONNECTION) {
                // TODO: online mode
                this.state = RakNetStatus.CONNECTED;
                this.listener.emit('openConnection', this);
            }
        } else if (id === MessageHeaders.DISCONNECT_NOTIFICATION) {
            this.disconnect();
        } else if (id === MessageHeaders.CONNECTED_PING) {
            this.handleConnectedPing(packet.content).then(
                (encapsulated) => this.sendFrame(encapsulated),
                () => {}
            );
        } else if (this.state === RakNetStatus.CONNECTED) {
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
     * @param reason the reason message, optional
     */
    public disconnect(reason = 'client disconnect'): void {
        // TODO: rewrite, works but can be improved
        this.close();
        // Send disconnect ACK
        this.state = RakNetStatus.DISCONNECTED;
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
        return this.state === RakNetStatus.DISCONNECTED;
    }

    public getListener(): RakNetListener {
        return this.listener;
    }

    public getAddress(): InetAddress {
        return new InetAddress(this.rinfo.address, this.rinfo.port, 4);
    }
}
