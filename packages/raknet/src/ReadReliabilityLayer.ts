import ReliabilityLayer, { NUMBER_OF_ORDERED_STREAMS } from './ReliabilityLayer.js';

import ACK from './protocol/ACK.js';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import BitFlags from './protocol/BitFlags.js';
import CongestionManager from './CongestionManager.js';
import Frame from './protocol/Frame.js';
import FrameReliability from './protocol/FrameReliability.js';
import { FrameSet } from './protocol/Protocol.js';
import { MessageIdentifiers } from './protocol/MessageIdentifiers.js';
import OrderingHeap from './protocol/datastructures/OrderingHeap.js';
import Queue from './protocol/datastructures/Queue.js';
import { RemoteInfo } from 'node:dgram';

export const DEFAULT_HAS_RECEIVED_PACKET_QUEUE_SIZE = 512;

export default class ReadReliabilityLayer extends ReliabilityLayer {
    private readonly highestSequencedIndex = Array.from<number>({ length: NUMBER_OF_ORDERED_STREAMS }).fill(0);

    private lastArrivedDatagramTime = Date.now();
    private congestionManager: CongestionManager;
    private receivedPacketsBaseIndex = 0;
    private hasReceivedPacketQueue = Array.from<boolean>({ length: DEFAULT_HAS_RECEIVED_PACKET_QUEUE_SIZE });
    private orderingHeaps = Array.from<OrderingHeap<Frame>>({ length: NUMBER_OF_ORDERED_STREAMS }).fill(
        new OrderingHeap<Frame>()
    );
    private outputQueue = new Queue<Frame>();
    private nacks: number[] = [];
    private receivePacketCount = 0;
    private timeSinceLastTick = 0;
    private lastUpdateTime = Date.now();

    private readonly fragmentsQueue: Map<number, Map<number, Frame>> = new Map();

    // We don't need the whole listener
    private sendRawBuffer: (buffer: Buffer) => void;

    public constructor(mtuSize: number, sendRaw: (buffer: Buffer) => void) {
        super(mtuSize);
        this.congestionManager = new CongestionManager(mtuSize);
        this.sendRawBuffer = sendRaw;
    }

    // Lookup table for packet handlers, always O(1) in average and worst case
    private readonly packetHandlers: Record<number, (buffer: Buffer, timestamp: number) => void> = {
        // 0x40 | 0xc0 = MessageHeaders.ACKNOWLEDGE_PACKET
        [MessageIdentifiers.ACKNOWLEDGE_PACKET]: (buffer: Buffer) => {
            const ack = this.packetPool.getAckInstance();
            (ack as any).buffer = buffer;
            ack.decode();
            console.log("GOT ACK: " + JSON.stringify(ack));
            // this.handleACK(ack);
        },
        [MessageIdentifiers.NACKNOWLEDGE_PACKET]: (buffer: Buffer) => {
            const nack = this.packetPool.getNackInstance();
            (nack as any).buffer = buffer;
            nack.decode();
            console.log("GOT NACK");
            // this.handleNACK(nack);
        },
        [BitFlags.VALID]: (buffer: Buffer, timestamp: number) => {
            const frameSet = this.packetPool.getFrameSetInstance();
            (frameSet as any).buffer = buffer;
            frameSet.decode();

            let args = { datagram: frameSet, skippedMessageCount: 0, timestamp }; 
            if (!this.congestionManager.onGotPacket(args)) {
                console.log('Congestion failed onGotPacket');
                return true;
            }

            const { skippedMessageCount } = args;

            for (let skippedMessageOffset = skippedMessageCount; skippedMessageOffset > 0; --skippedMessageOffset) {
                this.nacks.push(frameSet.sequenceNumber - skippedMessageOffset);
            }

            this.sendAcknowledgementPacket(frameSet.sequenceNumber);

            for (let frame of frameSet.frames) {
                // Check for corrupt orderingChannel
                if (frame.isSequenced() || frame.reliability === FrameReliability.RELIABLE_ORDERED) {
                    if (frame.orderChannel >= NUMBER_OF_ORDERED_STREAMS) {
                        console.log('frame.orderingChannel >= NUMBER_OF_ORDERED_STREAMS');
                        continue;
                    }
                }

                if (
                    frame.reliability === FrameReliability.RELIABLE ||
                    frame.reliability === FrameReliability.RELIABLE_SEQUENCED ||
                    frame.reliability === FrameReliability.RELIABLE_ORDERED
                ) {
                    const holeCount = frame.reliableIndex! - this.receivedPacketsBaseIndex;

                    /* console.log(
                        'waiting on reliableMessageNumber=%d holeCount=%i, datagramNumber=%i',
                        frame.reliableIndex,
                        holeCount,
                        frameSet.sequenceNumber
                    ); */

                    // Max value with unsigned 24 bits (should also be -1)
                    const typeRange = Math.pow(2, 24);

                    if (holeCount === 0) {
                        if (this.hasReceivedPacketQueue.length > 0) {
                            // void return value
                            void this.hasReceivedPacketQueue.pop();
                        }
                        ++this.receivedPacketsBaseIndex;
                    } else if (holeCount > typeRange / 2) {
                        console.log('holeCount > typeRange/2');
                        // this.packetPool.returnFrameSet(frameSet);
                        continue;
                    } else if (holeCount < this.hasReceivedPacketQueue.length) {
                        // non undefined means hole
                        if (typeof this.hasReceivedPacketQueue[holeCount] !== "undefined") {
                            console.log('Higher count pushed to hasReceivedPacketQueue');
                            this.hasReceivedPacketQueue[holeCount] = false;
                        } else {
                            console.log('Duplicate packet ignored');
                            // this.packetPool.returnFrameSet(frameSet);
                            continue;
                        }
                    } else {
                        if (holeCount > 1_000_000) {
                            console.log('holeCount > 1000000');
                            // this.packetPool.returnFrameSet(frameSet);
                            continue;
                        }

                        while (holeCount > this.hasReceivedPacketQueue.length) {
                            this.hasReceivedPacketQueue.push(true);
                        }
                        this.hasReceivedPacketQueue.push(false);
                    }

                    while (
                        this.hasReceivedPacketQueue.length > 0 &&
                        this.hasReceivedPacketQueue[this.hasReceivedPacketQueue.length - 1] === false
                    ) {
                        console.log("DIOCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
                        this.hasReceivedPacketQueue.pop();
                        ++this.receivedPacketsBaseIndex;
                    }
                }

                if (frame.isFragmented()) {
                    if (
                        frame.reliability !== FrameReliability.RELIABLE_ORDERED &&
                        frame.reliability !==
                            FrameReliability.RELIABLE_SEQUENCED /* && frame.reliability !== FrameReliability.UNRELIABLE_SEQUENCED */
                    ) {
                        frame.orderChannel = 255;
                    }

                    // TODO: original algo :skull:
                    const rebuilt = this.handleFragment(frame);
                    if (rebuilt) {
                        frame = rebuilt;
                    } else {
                        console.log("handleFragment did not return anything.")
                        continue;
                    }
                }

                if (
                    frame.reliability === FrameReliability.RELIABLE_SEQUENCED ||
                    frame.reliability === FrameReliability.UNRELIABLE_SEQUENCED ||
                    frame.reliability === FrameReliability.RELIABLE_ORDERED
                ) {
                    if (frame.orderIndex === this.orderedIndex[frame.orderChannel]) {
                        if (frame.isSequenced()) {
                            if (
                                ReadReliabilityLayer.isOlderOrderedPacket(
                                    frame.sequenceIndex!,
                                    this.highestSequencedIndex[frame.orderChannel]
                                ) === false
                            ) {
                                this.highestSequencedIndex[frame.orderChannel] = frame.sequenceIndex! + 1;
                            } else {
                                console.log('Sequenced rejected: lower than highest known value');
                                continue;
                            }
                        } else {
                            this.outputQueue.push(frame);

                            this.orderedIndex[frame.orderChannel]++;
                            this.highestSequencedIndex[frame.orderChannel] = 0;

                            while (
                                this.orderingHeaps[frame.orderChannel].size > 0 &&
                                this.orderingHeaps[frame.orderChannel].peek().orderIndex ===
                                    this.orderedIndex[frame.orderChannel]
                            ) {
                                frame = this.orderingHeaps[frame.orderChannel].pop(0);

                                this.outputQueue.push(frame);

                                if (frame.reliability === FrameReliability.RELIABLE_ORDERED) {
                                    this.orderedIndex[frame.orderChannel]++;
                                } else {
                                    this.highestSequencedIndex[frame.orderChannel] = frame.sequenceIndex!;
                                }
                            }
                            continue;
                        }
                    } else if (
                        ReadReliabilityLayer.isOlderOrderedPacket(frame.orderIndex!, this.orderedIndex[frame.orderChannel]) === false
                    ) {
                        if (this.orderingHeaps[frame.orderChannel].size === 0) {
                            console.log('TODO');
                            // TODO: heap index offset
                        }

                        // const orderedHoleCount =

                        console.log('Larger number ordered packet leaving holes');
                        continue;
                    } else {
                        console.log('Rejected older resend');
                        continue;
                    }
                }

                this.outputQueue.push(frame);
            }

            this.receivePacketCount++;
        }
    };

    private sendACKs(): void {
        if (this.acknowlegements.size > 0) {
            const ack = new ACK();
            ack.sequenceNumbers = Array.from(this.acknowlegements).map((seq) => {
                this.acknowlegements.delete(seq);
                return seq;
            });
            ack.encode();
            // console.log("SendAcks")
            this.sendRawBuffer(ack.getBuffer());
            this.congestionManager.onSendAck();
        }
    }

    public handleFragment(frame: Frame): Frame | null {
        console.log("FRAGMENT")
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

                this.sendACKs();
                this.fragmentsQueue.delete(frame.fragmentId);
                return assembledFrame;
            }
        }
        console.log(this.fragmentsQueue)
        return null;
    }

    public handleFromConnectedClient(buffer: Buffer, rinfo: RemoteInfo): void {
        // TODO: metrics (?)
        this.lastArrivedDatagramTime = Date.now();

        // Mask the lower 4 bits of the header
        // to get the range of header values
        const handler = this.packetHandlers[buffer[0] & 0xf0];
        if (handler) {
            handler(buffer, Date.now());
        } else {
            console.log('porcodio');
            // this.listener.getLogger().debug('Received an unknown packet type=%d', buffer[0]);
        }
    }

    private static isOlderOrderedPacket(newOrderingIndex: number, waitingForOrderingIndex: number): boolean {
        const maxRange = Math.pow(2, 24) - 1;

        if (waitingForOrderingIndex > maxRange / 2) {
            if (
                newOrderingIndex >= waitingForOrderingIndex - maxRange / 2 + 1 &&
                newOrderingIndex < waitingForOrderingIndex
            ) {
                return true;
            }
        } else {
            if (
                newOrderingIndex >= waitingForOrderingIndex - (maxRange / 2 + 1) ||
                newOrderingIndex < waitingForOrderingIndex
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns the an end-user packet already parsed out.
     * @param {Buffer} buffer - The parsed packet buffer. 
     * @returns {number} The length of the buffer in bytes.
     */
    public receive(): Buffer | void {
        if (this.outputQueue.size > 0) {
            const packet = this.outputQueue.pop();
            return packet.content;
        }
    }

    public update(timestamp: number): void {
        if (timestamp <= this.lastUpdateTime) {
            this.lastUpdateTime = timestamp;
            console.log("YES")
            return;
        }

        this.timeSinceLastTick = timestamp - this.lastUpdateTime;
        this.lastUpdateTime = timestamp;
        if (this.timeSinceLastTick > 100000) {
            this.timeSinceLastTick = 100000;
        }

        if (this.congestionManager.shouldSendACKs(timestamp, this.timeSinceLastTick)) {
            this.sendACKs();
        }
    }
}
