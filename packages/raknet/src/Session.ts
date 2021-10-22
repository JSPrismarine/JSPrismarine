import ACK from './protocol/ACK';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import BitFlags from './protocol/BitFlags';
import ConnectedPing from './protocol/connection/ConnectedPing';
import ConnectedPong from './protocol/connection/ConnectedPong';
import ConnectionRequest from './protocol/login/ConnectionRequest';
import ConnectionRequestAccepted from './protocol/login/ConnectionRequestAccepted';
import Frame from './protocol/Frame';
import FrameReliability from './protocol/FrameReliability';
import FrameSet from './protocol/FrameSet';
import InetAddress from './utils/InetAddress';
import { MAX_CHANNELS } from './RakNet';
import MessageHeaders from './protocol/MessageHeaders';
import NACK from './protocol/NACK';
import Packet from './protocol/Packet';
import RakNetListener from './Listener';
import { RemoteInfo } from 'dgram';
import assert from 'assert';

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

    private readonly offlineMode: boolean;

    private state = RakNetStatus.CONNECTING;

    private outputFrameQueue = new FrameSet();
    private outputSequenceNumber = 0;
    private outputReliableIndex = 0;
    private outputSequenceIndex = 0;
    private readonly outputBackupQueue: Map<number, FrameSet> = new Map();

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

    public constructor(listener: RakNetListener, mtuSize: number, rinfo: RemoteInfo, offlineMode = false) {
        this.listener = listener;

        this.mtuSize = mtuSize;
        this.rinfo = rinfo;
        this.offlineMode = offlineMode;

        this.lastUpdate = Date.now();

        this.channelIndex = new Array(MAX_CHANNELS).fill(0);
        this.inputOrderIndex = new Array(MAX_CHANNELS).fill(0);
        this.inputHighestSequenceIndex = new Array(MAX_CHANNELS).fill(0);
    }

    public update(timestamp: number): void {
        if (!this.isActive() && this.lastUpdate + 10_000 < timestamp) {
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

        const header = buffer[0];
        if (header & BitFlags.ACK) {
            const ack = new ACK(buffer);
            ack.decode();
            this.handleACK(ack);
        } else if (header & BitFlags.NACK) {
            const nack = new NACK(buffer);
            nack.decode();
            this.handleNACK(nack);
        } else {
            const frameSet = new FrameSet(buffer);
            frameSet.decode();
            this.handleFrameSet(frameSet);
        }
    }

    private handleFrameSet(frameSet: FrameSet): void {
        // Check if we already received packet and so we don't handle them
        if (this.receivedFrameSequences.has(frameSet.sequenceNumber)) {
            return;
        }

        // Check if the packet was a missing one, so in the nack queue
        // if it was missing, remove from the queue because we received it now
        if (this.lostFrameSequences.has(frameSet.sequenceNumber)) {
            // May not need condition, to check
            this.lostFrameSequences.delete(frameSet.sequenceNumber);
        } else {
            // For now is good like that
            if (
                frameSet.sequenceNumber < this.lastInputSequenceNumber ||
                frameSet.sequenceNumber === this.lastInputSequenceNumber
            ) {
                return;
            }
        }

        // Add the packet to the 'sent' queue
        // to let know the game we sent the packet
        this.receivedFrameSequences.add(frameSet.sequenceNumber);

        // Add the packet to the received window, a property that keeps
        // all the sequence numbers of packets we received
        // its function is to check if when we lost some packets
        // check wich are really lost by searching if we received it there
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
            this.receiveFrame(frame);
        }
    }

    private handleACK(ack: ACK): void {
        // TODO: ping calculation

        for (const seq of ack.sequenceNumbers) {
            this.receivedFrameSequences.delete(seq);
            this.outputBackupQueue.delete(seq);
        }
    }

    private handleNACK(_: NACK): void {
        // TODO: properly handle NACKs
        // for (const seq of nack.sequenceNumbers) {
        //    console.log(`NAKC ${seq}`);
        //    const pk = this.outputBackupQueue.get(seq) ?? null;
        //    if (pk != null) {
        //        pk.sequenceNumber = this.outputSequenceNumber++;
        //        pk.reset();
        //        pk.encode();
        //        this.sendFrameSet(pk);
        //        this.outputBackupQueue.delete(seq);
        //    }
        // }
    }

    private receiveFrame(frame: Frame): void {
        if (frame.isFragmented()) {
            this.handleFragment(frame);
            return;
        }

        const orderChannel = frame.orderChannel as number;
        const orderIndex = frame.orderIndex as number;
        const sequenceIndex = frame.sequenceIndex as number;

        if (frame.isSequenced()) {
            if (
                sequenceIndex < this.inputHighestSequenceIndex[orderChannel] ||
                orderIndex < this.inputOrderIndex[orderChannel]
            ) {
                // Packet is too old, discard it
                return;
            }

            this.inputHighestSequenceIndex[orderChannel] = sequenceIndex + 1;
            this.handlePacket(frame);
        } else if (frame.isOrdered()) {
            if (!this.inputOrderingQueue.has(orderChannel)) {
                this.inputOrderingQueue.set(orderChannel, new Map());
            }

            if (orderIndex === this.inputOrderIndex[orderChannel]) {
                this.inputHighestSequenceIndex[orderIndex] = 0;
                this.inputOrderIndex[orderChannel] = orderIndex + 1;

                this.handlePacket(frame);
                let i = this.inputOrderIndex[orderChannel];
                const outOfOrderQueue = this.inputOrderingQueue.get(orderChannel)!;
                for (; outOfOrderQueue.has(i); i++) {
                    const packet = outOfOrderQueue.get(i)!;
                    this.handlePacket(packet);
                    outOfOrderQueue.delete(i);
                }

                this.inputOrderIndex[orderChannel] = i;
            } else if (orderIndex > this.inputOrderIndex[orderChannel]) {
                this.inputOrderingQueue.get(orderChannel)!.set(orderIndex, frame);
            } else {
                return;
            }
        } else {
            this.handlePacket(frame);
        }
    }

    public sendFrame(frame: Frame, flags = RakNetPriority.NORMAL): void {
        assert(typeof frame.orderChannel === 'number', 'Frame OrderChannel cannot be null');
        if (frame.isOrdered()) {
            if (frame.isSequenced()) {
                // Sequenced packets don't increase the ordered channel index
                frame.orderIndex = this.channelIndex[frame.orderChannel];
            } else {
                frame.orderIndex = this.channelIndex[frame.orderChannel]++;
            }
        } else if (frame.isSequenced()) {
            frame.sequenceIndex = this.outputSequenceIndex++;
        }

        // Split packet if bigger than MTU size
        const maxMtu = this.mtuSize - 36;
        if (frame.getByteLength() + 4 > maxMtu) {
            // Split the buffer into chunks
            const buffers: Map<number, Buffer> = new Map();
            let index = 0;
            let splitIndex = 0;

            while (index < frame.content.byteLength) {
                // Push format: [chunk index: int, chunk: buffer]
                buffers.set(splitIndex++, frame.content.slice(index, (index += maxMtu)));
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

                this.addFrameToQueue(newFrame, flags);
            }
        } else {
            if (frame.isReliable()) {
                frame.reliableIndex = this.outputReliableIndex++;
            }
            this.addFrameToQueue(frame, flags);
        }
    }

    private addFrameToQueue(frame: Frame, priority = RakNetPriority.NORMAL): void {
        if (this.outputFrameQueue.getByteLength() + frame.getByteLength() > this.mtuSize) {
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
                this.handleConnectionRequest(packet.content).then((encapsulated) =>
                    this.sendFrame(encapsulated, RakNetPriority.IMMEDIATE)
                );
            } else if (id === MessageHeaders.NEW_INCOMING_CONNECTION) {
                // TODO: online mode
                this.state = RakNetStatus.CONNECTED;
                this.listener.emit('openConnection', this);
            }
        } else if (id === MessageHeaders.DISCONNECT_NOTIFICATION) {
            this.disconnect('client disconnect');
        } else if (id === MessageHeaders.CONNECTED_PING) {
            this.handleConnectedPing(packet.content).then((encapsulated) =>
                this.sendFrame(encapsulated, RakNetPriority.IMMEDIATE)
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
        sendPacket.reliability = FrameReliability.RELIABLE_ORDERED;
        sendPacket.orderChannel = 0;
        sendPacket.content = pk.getBuffer();

        return sendPacket;
    }

    public async handleConnectedPing(buffer: Buffer): Promise<Frame> {
        const dataPacket = new ConnectedPing(buffer);
        dataPacket.decode();

        const pk = new ConnectedPong();
        pk.clientTimestamp = dataPacket.clientTimestamp;
        pk.serverTimestamp = BigInt(new Date().getTime());
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
            this.fragmentsQueue.set(frame.fragmentIndex, value);

            // If we have all pieces, put them together
            if (value.size === frame.fragmentSize) {
                const stream = new BinaryStream();
                // Ensure the correctness of the buffer orders
                for (let i = 0; i < value.size; i++) {
                    const splitPacket = value.get(i)!;
                    stream.append(splitPacket.content);
                }

                const assembledFrame = new Frame();
                assembledFrame.content = stream.getBuffer();
                assembledFrame.reliability = frame.reliability;
                if (frame.isOrdered()) {
                    assembledFrame.orderIndex = frame.orderIndex;
                    assembledFrame.orderChannel = frame.orderChannel;
                }

                this.fragmentsQueue.delete(frame.fragmentId);
                this.receiveFrame(assembledFrame);
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
        this.outputBackupQueue.set(frameSet.sequenceNumber, frameSet);
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
    public disconnect(reason?: string): void {
        this.state = RakNetStatus.DISCONNECTED;
        this.listener.removeSession(this, reason ?? '');
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
