import Frame from './protocol/Frame.js';
import FrameReliability from './protocol/FrameReliability.js';
import { UDP_HEADER_SIZE } from './RakNet.js';
import ReliabilityLayer, { NUMBER_OF_ORDERED_STREAMS } from './ReliabilityLayer.js';
import { RakNetPriority } from './Session.js';
import FrameSet, { DATAGRAM_HEADER_BYTE_LENGTH } from './protocol/FrameSet.js';
import { MAX_FRAME_BYTE_LENGTH } from './protocol/Frame.js';
import OrderingHeap from './protocol/datastructures/OrderingHeap.js';

export default class WriteReliabilityLayer extends ReliabilityLayer {
    private readonly sequencedIndex = Array.from<number>({ length: NUMBER_OF_ORDERED_STREAMS }).fill(0);
    private outgoingPacketBufferNextWeights!: number[];
    private readonly outgoingPacketBuffer = new OrderingHeap<Frame>();
    private lastReliableSend = 0;
    private sendReliableMessageNumberIndex = 0;
    private internalOrderIndex = 0;
    private splitPacketId = 0;

    private sendRaw: (buffer: Buffer) => void;

    public constructor(
        mtuSize: number,
        sendRaw: (buffer: Buffer) => void
    ) {
        super(mtuSize);
        this.initHeapWeights();
        this.sendRaw = sendRaw;
    }

    public sendImmediate(buffer: Buffer, priority: RakNetPriority, reliability: FrameReliability, orderingChannel: number, currentTime: number): void {
        this.send(buffer, priority, reliability, orderingChannel, currentTime);

        if ([FrameReliability.RELIABLE, FrameReliability.RELIABLE_ORDERED, FrameReliability.RELIABLE_SEQUENCED, FrameReliability.UNREALIABLE_WITH_ACK_RECEIPT, FrameReliability.RELIABLE_ORDERED_WITH_ACK_RECEIPT].includes(reliability)) {
            this.lastReliableSend = Date.now();
        }
    }

    public send(buffer: Buffer, priority: RakNetPriority, reliability: FrameReliability, orderChannel: number, currentTime: number) {
        if (reliability > FrameReliability.RELIABLE_ORDERED_WITH_ACK_RECEIPT || reliability < 0) {
            reliability = FrameReliability.RELIABLE;
        }

        // TODO: rest

        const frame = new Frame();
        frame.reliability = reliability;
        frame.content = buffer;
        frame.priority = priority;
        frame.reliableIndex = this.internalOrderIndex++;

        const maxDataSizeBytes = (this.mtuSize - UDP_HEADER_SIZE) - DATAGRAM_HEADER_BYTE_LENGTH - MAX_FRAME_BYTE_LENGTH;
        const splitPacket = buffer.byteLength > maxDataSizeBytes;

        if (splitPacket) {
            // Split packets cannot be unreliable
            if (frame.reliability === FrameReliability.UNRELIABLE) {
                frame.reliability = FrameReliability.RELIABLE;
            } else if (frame.reliability === FrameReliability.UNREALIABLE_WITH_ACK_RECEIPT) {
                frame.reliability = FrameReliability.RELIABLE_WITH_ACK_RECEIPT;
            } else if (frame.reliability === FrameReliability.UNRELIABLE_SEQUENCED) {
                frame.reliability = FrameReliability.RELIABLE_SEQUENCED;
            }
        }

        if ([FrameReliability.RELIABLE_SEQUENCED, FrameReliability.UNRELIABLE_SEQUENCED].includes(frame.reliability)) {
            frame.orderChannel = orderChannel;
            frame.orderIndex = this.orderedIndex[orderChannel];
            frame.sequenceIndex = this.sequencedIndex[orderChannel]++;
        } else if ([FrameReliability.RELIABLE_ORDERED, FrameReliability.RELIABLE_ORDERED_WITH_ACK_RECEIPT]) {
            frame.orderChannel = orderChannel;
            frame.orderIndex = this.orderedIndex[orderChannel]++;
            this.sequencedIndex[orderChannel] = 0;
        }

        if (splitPacket) {
            this.splitPacket(frame);
            return;
        }

        this.outgoingPacketBuffer.insert(this.getNextWeight(priority), frame);
    }

    private initHeapWeights(): void {
        this.outgoingPacketBufferNextWeights = Array.from({ length: RakNetPriority.NUMBER_OF_PRIORITIES }, (_, priorityLevel) => (1 << priorityLevel) * priorityLevel + priorityLevel);
    }

    private getNextWeight(priorityLevel: RakNetPriority): number {
        let next = this.outgoingPacketBufferNextWeights[priorityLevel];
        if (this.outgoingPacketBuffer.size > 0) {
            const peekPl = this.outgoingPacketBuffer.peek().priority;
            const weight = this.outgoingPacketBuffer.peek().weight;
            const min = weight - (1 << peekPl) * peekPl + peekPl;
            if (next < min) {
                next = min + (1 << priorityLevel) * priorityLevel + priorityLevel;
            }
            this.outgoingPacketBufferNextWeights[priorityLevel] = next + (1 << priorityLevel) * (priorityLevel + 1) + priorityLevel;
        } else {
            this.initHeapWeights();
        }
        return next;
    }

    private splitPacket(frame: Frame): void {
        const maxDataSizeBytes = (this.mtuSize - UDP_HEADER_SIZE) - DATAGRAM_HEADER_BYTE_LENGTH - MAX_FRAME_BYTE_LENGTH;

        const buffers: Map<number, Buffer> = new Map();
        let index = 0;
        let splitIndex = 0;

        while (index < frame.content.byteLength) {
            // Push format: [chunk index: int, chunk: buffer]
            buffers.set(splitIndex++, frame.content.slice(index, (index += maxDataSizeBytes)));
        }

        const fragmentId = this.splitPacketId++ % 65536;
        for (const [index, buffer] of buffers) {
            const newFrame = new Frame();
            newFrame.reliability = frame.reliability;
            newFrame.fragmentId = fragmentId;
            newFrame.fragmentSize = buffers.size;
            newFrame.fragmentIndex = index;
            newFrame.content = buffer;

            newFrame.sequenceIndex = frame.sequenceIndex;
            newFrame.orderChannel = frame.orderChannel;
            newFrame.orderIndex = frame.orderIndex;
            newFrame.reliableIndex = frame.reliableIndex;

            if (index !== 0) {
                newFrame.reliableIndex = this.internalOrderIndex++;
            }

            this.outgoingPacketBuffer.insert(this.getNextWeight(frame.priority), newFrame);
        }


        // If we use the frame as reference, we have to copy somewhere
        // the original buffer. Then we will point to this buffer content
        // const buffer = Buffer.from(frame.content);
        // const fragmentId = this.splitPacketId++ % 65536;
        // for (let i = 0; i < buffer.byteLength; i += maxDataSizeBytes) {
            // Like the original raknet, we like to use a pointer to the original
            // frame, we don't really care about side effects in this case.
            // RakNet will allocate the whole strcture containing splits,
            // but i think caching just the buffer is enough.
            // https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/ReliabilityLayer.cpp#L2963

            // Skip the first index as it's already increased by itself.
        //    if (i !== 0) {
        //        frame.reliableIndex = this.internalOrderIndex++;
        //    }

        //    frame.content = buffer.slice(i, i + maxDataSizeBytes);
        //    frame.fragmentIndex = i / maxDataSizeBytes;
        //    frame.fragmentId = fragmentId;
        //    frame.fragmentSize = Math.ceil(buffer.byteLength / maxDataSizeBytes);
        //    console.log(frame)
        //    this.outgoingPacketBuffer.insert(this.getNextWeight(frame.priority), frame);
        // }
    }

    public update(timestamp: number): void {
        // TODO
        while (this.outgoingPacketBuffer.size > 0) {
            const frame = this.outgoingPacketBuffer.pop(0);

            if (frame.isReliable()) {
                const frameSet = new FrameSet();
                frameSet.sequenceNumber = this.sendReliableMessageNumberIndex++;
                frameSet.frames.push(frame);
                frameSet.encode();
                this.sendRaw(frameSet.getBuffer());
            }

        }
    }
}
