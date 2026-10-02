import assert from 'node:assert';
import {
    DISCONNECT_LINGER_TIMEOUT_MS,
    MAX_CHANNELS,
    MAX_CONCURRENT_SPLITS,
    MAX_DATAGRAM_HISTORY,
    MAX_NACK_WINDOW,
    MAX_ORDERING_QUEUE_SIZE,
    MAX_RECEIVE_WINDOW,
    MAX_SKIPPED_DATAGRAMS,
    MAX_SPLIT_PACKET_COUNT,
    MAX_TRIAD_VALUE,
    RTO_ADDITIONAL_VARIANCE_MS,
    RTO_MAX_MS,
    SESSION_TIMEOUT_MS,
    SPLIT_PACKET_TIMEOUT_MS,
    TRIAD_RANGE,
    UDP_HEADER_SIZE
} from './Constants';
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
import NewIncomingConnection from './protocol/connection/NewIncomingConnection';
import ConnectionRequest from './protocol/login/ConnectionRequest';
import ConnectionRequestAccepted from './protocol/login/ConnectionRequestAccepted';
import { monotonicNow } from './utils/Clock';
import InetAddress from './utils/InetAddress';

import type { RemoteInfo } from 'node:dgram';
import type { RakNetPeer } from './RakNetPeer';
import type AcknowledgePacket from './protocol/AcknowledgePacket';
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

/**
 * Which side of the connection this session is.
 *
 * The reliability layer is symmetric and does not consult this; only the handshake does.
 * The two roles exchange disjoint messages - a server answers `CONNECTION_REQUEST` and
 * waits for `NEW_INCOMING_CONNECTION`, a client sends `CONNECTION_REQUEST` and answers
 * `CONNECTION_REQUEST_ACCEPTED` - so the branch could in principle be keyed on the message
 * id alone. It is not, deliberately: that would let a peer talk a listening server through
 * the client half of the handshake and reach `CONNECTED` without ever sending
 * `NEW_INCOMING_CONNECTION`.
 */
export enum RakNetRole {
    SERVER,
    CLIENT
}

/**
 * Why a session is in {@link SessionStatus.DISCONNECTING}, which is what decides how long it
 * lingers there. RakNet keeps the same two modes, and asks the reliability layer a different
 * question of each.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5875
 */
enum DisconnectMode {
    /** We hung up: wait until nothing of ours is left unacknowledged. */
    ASAP,
    /** The peer hung up: wait only until the acknowledgement we owe it has gone out. */
    ON_NO_ACK
}

/**
 * A reliable message awaiting acknowledgement, with the deadline after which it is
 * retransmitted. RakNet keeps the same three pieces of state on its `InternalPacket`.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1925
 */
interface ResendEntry {
    frame: Frame;
    nextActionTime: number;
    timesSent: number;
}

/** A split message being reassembled. */
interface SplitEntry {
    fragments: Map<number, Frame>;
    count: number;
    byteLength: number;
    startedAt: number;
}

export default class Session {
    private state = SessionStatus.CONNECTING;

    // ---------------------------------------------------------------- outgoing state

    private outputFrameQueue = new FrameSet();
    /** Wire size of {@link outputFrameQueue}, kept in step with it so the MTU check is O(1). */
    private outputFrameQueueByteLength = DATAGRAM_HEADER_BYTE_LENGTH;
    private outputSequenceNumber = 0;
    private outputReliableIndex = 0;
    private outputFragmentIndex = 0;

    private readonly outputOrderIndex: number[];
    private readonly outputSequenceIndex: number[];

    /**
     * Every reliable Frame we sent, keyed by its own reliableIndex, held until the
     * remote acknowledges a datagram that carried it.
     *
     * ACK/NACK talk about *datagrams*, but retransmission is a per-*message* operation:
     * a message keeps its identity (reliableIndex, orderIndex, fragment fields) across
     * every datagram it travels in. Keying this map by reliableIndex is what makes a
     * retransmission byte-identical to the original.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.h#L376 (resendBuffer)
     */
    private readonly resendBuffer: Map<number, ResendEntry> = new Map();

    /**
     * Which reliable message numbers travelled inside each datagram we sent, and when.
     * Translates an incoming ACK/NACK sequence number into the messages it refers to,
     * and provides the send timestamp the RTT estimate is derived from.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.h#L351 (datagramHistory)
     */
    private readonly datagramHistory: Map<number, { messageNumbers: number[]; sentAt: number }> = new Map();

    // ---------------------------------------------------------------- incoming state

    /** Datagrams we have received and still owe an ACK for. */
    private readonly ackQueue: Set<number> = new Set();
    /** Datagrams we believe were lost and want the peer to send again. */
    private readonly lostFrameSequences: Set<number> = new Set();

    /**
     * The next datagram sequence number we expect. Only used to spot gaps worth NACKing;
     * datagrams arriving out of order are still processed.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/CCRakNetSlidingWindow.cpp#L137
     */
    private expectedInputSequenceNumber = 0;

    /**
     * Duplicate detection for reliable messages: everything below the base index has been
     * received, and the set holds the ones received beyond it (the sequence's holes are
     * whatever is missing from it).
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L941 (hasReceivedPacketQueue)
     */
    private receivedPacketsBaseIndex = 0;
    private readonly receivedReliableIndexes: Set<number> = new Set();

    private readonly inputHighestSequenceIndex: number[];
    private readonly inputOrderIndex: number[];
    /**
     * Frames buffered per channel waiting for an ordering hole to be filled. Several
     * messages can share an orderingIndex (a run of sequenced ones followed by the ordered
     * message closing that index), so each index maps to a list kept in sequencingIndex
     * order rather than to a single frame.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1436 (orderingHeaps)
     */
    private readonly inputOrderingQueue: Map<number, Map<number, Frame[]>> = new Map();
    private readonly inputOrderingQueueSize: number[];

    /** Split messages being reassembled, keyed by the peer's fragment id. */
    private readonly fragmentsQueue: Map<number, SplitEntry> = new Map();

    // ---------------------------------------------------------------- timing

    /** Smoothed RTT and its deviation, in milliseconds; null until the first ACK lands. */
    private estimatedRTT: number | null = null;
    private deviationRTT = 0;

    // Last timestamp of packet received, helpful for timeout
    private lastUpdate: number = monotonicNow();
    private active = true;

    // ---------------------------------------------------------------- teardown

    private disconnectMode = DisconnectMode.ASAP;
    /** Reported to the peer's owner when the session is finally forgotten. */
    private disconnectReason = 'connection lost';
    /** When the linger gives up on an acknowledgement that is not coming. */
    private disconnectDeadline = 0;

    // Packet pool is the best option to reduce allocations
    private readonly packetPool = new PacketPool();

    public constructor(
        private readonly listener: RakNetPeer,
        private readonly mtuSize: number,
        public readonly rinfo: RemoteInfo,
        public readonly guid: bigint,
        public readonly role: RakNetRole = RakNetRole.SERVER
    ) {
        this.lastUpdate = monotonicNow();

        this.outputOrderIndex = new Array(MAX_CHANNELS).fill(0);
        this.outputSequenceIndex = new Array(MAX_CHANNELS).fill(0);

        this.inputOrderIndex = new Array(MAX_CHANNELS).fill(0);
        this.inputHighestSequenceIndex = new Array(MAX_CHANNELS).fill(0);
        this.inputOrderingQueueSize = new Array(MAX_CHANNELS).fill(0);
        for (let i = 0; i < MAX_CHANNELS; i++) {
            this.inputOrderingQueue.set(i, new Map());
        }
    }

    /**
     * @param timestamp - a reading of {@link monotonicNow}, defaulting to one taken here.
     *
     * Every deadline this compares against is on that clock, so a caller passing
     * `Date.now()` is not merely imprecise: epoch milliseconds beside process-relative ones
     * expire every retransmission and every reassembly at once and time the session out on
     * the first pass where it is idle. Pass a value only to update several sessions against
     * one instant, or to drive time forward in a test.
     */
    public update(timestamp: number = monotonicNow()): void {
        if (this.isDisconnected()) return;

        if (
            this.state !== SessionStatus.DISCONNECTING &&
            !this.isActive() &&
            this.lastUpdate + SESSION_TIMEOUT_MS < timestamp
        ) {
            // Nothing is said to a peer that has already stopped answering: RakNet treats a
            // dead connection as closed immediately and silently, and a goodbye would only be
            // one more datagram into the void.
            // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5919
            this.disconnectImmediate('timeout');
            return;
        }

        this.active = false;

        this.sendAcknowledgements();
        this.expireSplitPackets(timestamp);
        this.resendTimedOutMessages(timestamp);
        this.sendFrameQueue();

        // Last, so the pass that decides the goodbye is done is the one that has just sent
        // everything owed - including a retransmission of the goodbye itself.
        if (this.state === SessionStatus.DISCONNECTING && this.isLingerOver(timestamp)) {
            this.disconnectImmediate();
        }
    }

    /**
     * Whether the session has finished saying goodbye.
     *
     * The two questions RakNet asks of its reliability layer, one per mode: for a hang-up of
     * our own, whether anything of ours is still waiting to be acknowledged
     * (`IsOutgoingDataWaiting`); for the peer's, whether we still owe it an acknowledgement
     * (`AreAcksWaiting`). The deadline is the backstop for a peer that has stopped answering.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5875
     */
    private isLingerOver(timestamp: number): boolean {
        if (timestamp >= this.disconnectDeadline) return true;

        return this.disconnectMode === DisconnectMode.ON_NO_ACK
            ? this.ackQueue.size === 0
            : this.resendBuffer.size === 0;
    }

    // https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/ReliabilityLayer.cpp#L635
    public handle(buffer: Buffer): void {
        this.active = true;
        this.lastUpdate = monotonicNow();

        // The datagram header is a bitfield, not an enumeration: bit 0x40 is ACK, 0x20 is
        // NAK, and everything else is a data datagram whose remaining low bits (packet
        // pair, continuous send, needs B and AS) say nothing about its type. Masking the
        // whole high nibble would send a valid 0x90 datagram down the unknown path.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L150
        const header = buffer[0]!;

        if ((header & BitFlags.ACK) !== 0) {
            const ack = this.packetPool.getAckInstance();
            try {
                ack.reuse(buffer);
                ack.decode();
                this.handleACK(ack);
            } finally {
                this.packetPool.returnAck(ack);
            }
        } else if ((header & BitFlags.NACK) !== 0) {
            const nack = this.packetPool.getNackInstance();
            try {
                nack.reuse(buffer);
                nack.decode();
                this.handleNACK(nack);
            } finally {
                this.packetPool.returnNack(nack);
            }
        } else {
            const frameSet = this.packetPool.getFrameSetInstance();
            try {
                frameSet.reuse(buffer);
                frameSet.decode();
                this.handleFrameSet(frameSet);
            } finally {
                this.packetPool.returnFrameSet(frameSet);
            }
        }
    }

    /**
     * A datagram sequence number only drives acknowledgement and loss detection. Ordering
     * and duplicate suppression are message-level concerns, handled further down, so a
     * datagram arriving out of order is processed like any other rather than dropped.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/CCRakNetSlidingWindow.cpp#L128 (OnGotPacket)
     */
    private handleFrameSet(frameSet: FrameSet): void {
        const sequenceNumber = frameSet.sequenceNumber;
        let skipped = 0;

        if (sequenceNumber === this.expectedInputSequenceNumber) {
            this.expectedInputSequenceNumber = (sequenceNumber + 1) % TRIAD_RANGE;
        } else if (!this.isOlderOrderedFrame(sequenceNumber, this.expectedInputSequenceNumber)) {
            // Ahead of what we expected: everything in between is missing.
            skipped = (sequenceNumber - this.expectedInputSequenceNumber + TRIAD_RANGE) % TRIAD_RANGE;
            if (skipped > MAX_SKIPPED_DATAGRAMS) {
                this.listener
                    .getLogger()
                    .debug(
                        `Discarded datagram with implausible sequence gap=${skipped} from client=${this.getAddress()}`,
                        'RakNet/Session/handleFrameSet'
                    );
                return;
            }
            // The gap is peer-controlled, so cap how many NACKs one datagram can cost us.
            if (skipped > MAX_NACK_WINDOW) skipped = MAX_NACK_WINDOW;
            this.expectedInputSequenceNumber = (sequenceNumber + 1) % TRIAD_RANGE;
        }
        // Otherwise the datagram is older than expected: no new holes, but still valid.

        for (let i = skipped; i > 0; i--) {
            this.lostFrameSequences.add((sequenceNumber - i + TRIAD_RANGE) % TRIAD_RANGE);
        }

        // We have it now, so stop asking for it, and owe the peer an acknowledgement.
        this.lostFrameSequences.delete(sequenceNumber);
        this.ackQueue.add(sequenceNumber);

        for (const frame of frameSet.frames) {
            this.handleFrame(frame);
        }
    }

    /**
     * The datagram arrived: every message it carried is delivered and can leave the
     * resend buffer. A message acknowledged through *any* datagram is done, even if a
     * later retransmission of it is still outstanding.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L772
     */
    private handleACK(ack: ACK): void {
        const now = monotonicNow();

        for (const seq of this.matchDatagramHistory(ack)) {
            const entry = this.datagramHistory.get(seq)!;

            this.datagramHistory.delete(seq);
            this.onRoundTripSample(now - entry.sentAt);

            for (const reliableIndex of entry.messageNumbers) {
                this.resendBuffer.delete(reliableIndex);
            }
        }
    }

    /**
     * The datagrams of ours that an acknowledgement names, oldest sequence number first.
     *
     * Resolved by walking our own history rather than the peer's records: the answer is
     * `records ∩ datagramHistory` either way, but the history is bounded by
     * {@link MAX_DATAGRAM_HISTORY} while the records are bounded only by what the peer
     * felt like claiming.
     *
     * The ascending order matters. `onRoundTripSample` folds each measurement into a
     * running estimate, and `handleNACK` re-queues in the order it iterates, so both
     * depend on the sequence being walked the way a well formed acknowledgement lists it.
     */
    private matchDatagramHistory(packet: AcknowledgePacket): number[] {
        const matched: number[] = [];

        for (const seq of this.datagramHistory.keys()) {
            if (packet.contains(seq)) matched.push(seq);
        }

        return matched.sort((a, b) => a - b);
    }

    /**
     * The datagram was lost: re-queue the messages it carried *verbatim*.
     *
     * Their reliableIndex, orderIndex, sequenceIndex and fragment fields must not be
     * touched - only the sequence number of the datagram transporting them changes.
     * Re-running the send path here would hand the receiver a different orderIndex,
     * leaving a hole its ordering heap can never fill.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L840
     */
    private handleNACK(nack: NACK): void {
        let requeued = false;

        for (const seq of this.matchDatagramHistory(nack)) {
            const entry = this.datagramHistory.get(seq)!;

            // This datagram is gone for good; the messages stay in the resend buffer
            // until acknowledged, and will be re-registered under the new datagram.
            this.datagramHistory.delete(seq);

            for (const reliableIndex of entry.messageNumbers) {
                const pending = this.resendBuffer.get(reliableIndex);
                // Already acknowledged through another datagram, or evicted: skip it.
                if (!pending) continue;

                this.addFrameToQueue(pending.frame, RakNetPriority.NORMAL);
                requeued = true;
            }
        }

        // Pack the retransmissions into as few datagrams as the MTU allows.
        if (requeued) {
            this.sendFrameQueue();
        }
    }

    private handleFrame(frame: Frame): void {
        // Duplicate suppression comes first and is keyed on the reliable message number,
        // because a retransmission arrives in a different datagram than the original.
        if (this.isDuplicateReliableFrame(frame)) {
            return;
        }

        if (frame.isFragmented()) {
            this.handleFragment(frame);
            return;
        }

        // Handle packets without ordering
        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1248-L1251
        if (!frame.isOrdered()) {
            this.handlePacket(frame);
            return;
        }

        const orderChannel = frame.orderChannel!;

        // The channel is a raw byte off the wire but only MAX_CHANNELS streams exist.
        // Anything above that would index past our arrays and throw.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L919
        if (!Number.isInteger(orderChannel) || orderChannel < 0 || orderChannel >= MAX_CHANNELS) {
            this.listener
                .getLogger()
                .debug(
                    `Discarded frame with invalid orderChannel=${orderChannel} from client=${this.getAddress()}`,
                    'RakNet/Session/handleFrame'
                );
            return;
        }

        const orderIndex = frame.orderIndex!;
        const expectedOrderIndex = this.inputOrderIndex[orderChannel]!;

        // First of all check the orderingIndex
        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1283
        if (orderIndex === expectedOrderIndex) {
            if (frame.isSequenced()) {
                // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1286-L1290
                const sequenceIndex = frame.sequenceIndex!;
                if (this.isOlderOrderedFrame(sequenceIndex, this.inputHighestSequenceIndex[orderChannel]!)) {
                    return;
                }

                // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1317
                this.inputHighestSequenceIndex[orderChannel] = (sequenceIndex + 1) % TRIAD_RANGE;
                this.handlePacket(frame);
            } else {
                // Handle ordered, non sequenced
                // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1372-L1373
                this.inputOrderIndex[orderChannel] = (orderIndex + 1) % TRIAD_RANGE;
                this.inputHighestSequenceIndex[orderChannel] = 0;
                this.handlePacket(frame);

                this.processOrderingHeap(orderChannel);
            }
        } else if (!this.isOlderOrderedFrame(orderIndex, expectedOrderIndex)) {
            // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1429-L1446
            this.bufferOutOfOrderFrame(orderChannel, orderIndex, frame);
        }

        // NO-OP: out of order
        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1464-L1466
    }

    /**
     * Rejects reliable messages we have already seen. Unreliable ones carry no message
     * number and are passed straight through.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L941
     */
    private isDuplicateReliableFrame(frame: Frame): boolean {
        if (!frame.isReliable() || typeof frame.reliableIndex !== 'number') {
            return false;
        }

        const reliableIndex = frame.reliableIndex;
        const holeCount = (reliableIndex - this.receivedPacketsBaseIndex + TRIAD_RANGE) % TRIAD_RANGE;

        // More than half the range away means it wrapped backwards: an old duplicate.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L959
        if (holeCount > TRIAD_RANGE / 2) {
            return true;
        }

        // Beyond the window we cannot track it without letting a peer decide how much
        // memory we spend. RakNet gives up past its own limit for the same reason.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1003
        if (holeCount > MAX_RECEIVE_WINDOW) {
            this.listener
                .getLogger()
                .debug(
                    `Discarded reliable frame ${holeCount} past the receive window from client=${this.getAddress()}`,
                    'RakNet/Session/isDuplicateReliableFrame'
                );
            return true;
        }

        if (this.receivedReliableIndexes.has(reliableIndex)) {
            return true;
        }
        this.receivedReliableIndexes.add(reliableIndex);

        // Slide the base past every message number that is now accounted for.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1039
        while (this.receivedReliableIndexes.delete(this.receivedPacketsBaseIndex)) {
            this.receivedPacketsBaseIndex = (this.receivedPacketsBaseIndex + 1) % TRIAD_RANGE;
        }

        return false;
    }

    private bufferOutOfOrderFrame(orderChannel: number, orderIndex: number, frame: Frame): void {
        if (this.inputOrderingQueueSize[orderChannel]! >= MAX_ORDERING_QUEUE_SIZE) {
            this.listener
                .getLogger()
                .debug(
                    `Ordering queue for channel=${orderChannel} is full, dropping frame from client=${this.getAddress()}`,
                    'RakNet/Session/bufferOutOfOrderFrame'
                );
            return;
        }

        const queue = this.inputOrderingQueue.get(orderChannel)!;
        const bucket = queue.get(orderIndex);

        if (!bucket) {
            queue.set(orderIndex, [frame]);
        } else {
            // Sequenced messages sort by sequencingIndex; the ordered message that closes
            // this orderingIndex sorts last, mirroring RakNet's heap weight.
            // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1439
            const weight = frame.isSequenced() ? frame.sequenceIndex! : Number.MAX_SAFE_INTEGER;
            let at = bucket.length;
            while (at > 0) {
                const other = bucket[at - 1]!;
                const otherWeight = other.isSequenced() ? other.sequenceIndex! : Number.MAX_SAFE_INTEGER;
                if (otherWeight <= weight) break;
                at--;
            }
            bucket.splice(at, 0, frame);
        }

        this.inputOrderingQueueSize[orderChannel]!++;
    }

    private processOrderingHeap(orderChannel: number): void {
        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1376-L1423
        const queue = this.inputOrderingQueue.get(orderChannel)!;

        for (;;) {
            const expectedIndex = this.inputOrderIndex[orderChannel]!;
            const bucket = queue.get(expectedIndex);
            if (!bucket || bucket.length === 0) {
                queue.delete(expectedIndex);
                return;
            }

            const bufferedFrame = bucket.shift()!;
            this.inputOrderingQueueSize[orderChannel]!--;
            if (bucket.length === 0) queue.delete(expectedIndex);

            this.handlePacket(bufferedFrame);

            if (bufferedFrame.isSequenced()) {
                // Note the asymmetry with the direct path above, which stores index + 1.
                // RakNet stores the bare index here.
                // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1420
                this.inputHighestSequenceIndex[orderChannel] = bufferedFrame.sequenceIndex!;
            } else {
                // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1415
                this.inputOrderIndex[orderChannel] = (expectedIndex + 1) % TRIAD_RANGE;
            }
        }
    }

    /**
     * Determines whether a packet is older than expected, handling wraparound.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L2901-L2920
     */
    public isOlderOrderedFrame(newIndex: number, currentIndex: number, maxValue: number = MAX_TRIAD_VALUE): boolean {
        const halfRange = Math.floor(maxValue / 2);
        const range = maxValue + 1;

        if (currentIndex > halfRange) {
            return newIndex >= currentIndex - halfRange + 1 && newIndex < currentIndex;
        }

        return newIndex >= (currentIndex - (halfRange + 1) + range) % range || newIndex < currentIndex;
    }

    public sendFrame(frame: Frame, priority = RakNetPriority.NORMAL): void {
        assert(typeof frame.orderChannel === 'number', 'Frame OrderChannel cannot be null');

        const maxSize = this.getMTU() - DATAGRAM_HEADER_BYTE_LENGTH - MAX_FRAME_BYTE_LENGTH;

        // Belt and braces: the MTU is clamped when the session is created, so this cannot
        // happen. If it ever does, dropping the message beats emitting fragments of a
        // non-positive size.
        if (maxSize <= 0) {
            this.listener
                .getLogger()
                .warn(`Cannot send frame, unusable MTU=${this.mtuSize}`, 'RakNet/Session/sendFrame');
            return;
        }

        const mustSplit = frame.content.byteLength > maxSize;

        // A split message cannot be unreliable: losing one fragment makes the whole thing
        // unusable, and nothing would ever ask for it again.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1611
        if (mustSplit) {
            if (frame.reliability === FrameReliability.UNRELIABLE) {
                frame.reliability = FrameReliability.RELIABLE;
            } else if (frame.reliability === FrameReliability.UNRELIABLE_WITH_ACK_RECEIPT) {
                frame.reliability = FrameReliability.RELIABLE_WITH_ACK_RECEIPT;
            } else if (frame.reliability === FrameReliability.UNRELIABLE_SEQUENCED) {
                frame.reliability = FrameReliability.RELIABLE_SEQUENCED;
            }
        }

        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1626
        if (frame.isSequenced()) {
            // Sequenced packets don't increase the ordered channel index
            frame.orderIndex = this.outputOrderIndex[frame.orderChannel]!;
            frame.sequenceIndex = this.outputSequenceIndex[frame.orderChannel]!;
            this.outputSequenceIndex[frame.orderChannel] =
                (this.outputSequenceIndex[frame.orderChannel]! + 1) % TRIAD_RANGE;
        } else if (frame.isOrderedExclusive()) {
            // implies sequenced, but we have to distinct them
            frame.orderIndex = this.outputOrderIndex[frame.orderChannel]!;
            this.outputOrderIndex[frame.orderChannel] = (this.outputOrderIndex[frame.orderChannel]! + 1) % TRIAD_RANGE;
            this.outputSequenceIndex[frame.orderChannel] = 0;
        }

        if (!mustSplit) {
            // Only reliable messages take a slot in the reliable numbering: the receiver
            // treats that sequence as contiguous when detecting duplicates.
            // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L2046
            if (frame.isReliable()) {
                frame.reliableIndex = this.nextReliableIndex();
            }

            this.addFrameToQueue(frame, priority);
            return;
        }

        // Every fragment is its own message: it carries its own reliableIndex and can be
        // retransmitted on its own, so it needs its own Frame. Sharing one instance would
        // make the resend buffer alias a single mutated object.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L2957
        const buffer = frame.content;
        const fragmentCount = Math.ceil(buffer.byteLength / maxSize);
        // Original RakNet says: This is the maximum number of split messages we can send simultaneously per connection.
        const fragmentId = this.outputFragmentIndex++ % 65536;

        for (let i = 0; i < fragmentCount; i++) {
            const fragment = new Frame();

            // A fragmented message keeps the ordering identity of the whole message:
            // all its parts share orderIndex and sequenceIndex.
            fragment.reliability = frame.reliability;
            fragment.orderChannel = frame.orderChannel;
            fragment.orderIndex = frame.orderIndex;
            fragment.sequenceIndex = frame.sequenceIndex;

            fragment.fragmentId = fragmentId;
            fragment.fragmentIndex = i;
            fragment.fragmentSize = fragmentCount; // RakNet's splitPacketCount
            fragment.content = buffer.subarray(i * maxSize, (i + 1) * maxSize);

            if (fragment.isReliable()) {
                fragment.reliableIndex = this.nextReliableIndex();
            }

            // Each fragment already fills the MTU, so it gets a datagram of its own.
            this.addFrameToQueue(fragment, RakNetPriority.IMMEDIATE);
        }
    }

    /**
     * Hands out the next reliable message number, wrapping at the 24 bit boundary the
     * wire format imposes.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L2901 (IsOlderOrderedPacket, which exists because these indices wrap)
     */
    private nextReliableIndex(): number {
        const index = this.outputReliableIndex;
        this.outputReliableIndex = (this.outputReliableIndex + 1) % TRIAD_RANGE;
        return index;
    }

    private addFrameToQueue(frame: Frame, priority = RakNetPriority.NORMAL): void {
        const frameLength = frame.getByteLength();

        // The running total is kept incrementally rather than re-summed here: appending n
        // frames used to cost O(n²) calls to getByteLength, and a datagram of small
        // messages holds ~50 of them.
        if (this.outputFrameQueueByteLength + frameLength > this.getMTU()) {
            this.sendFrameQueue();
        }

        this.outputFrameQueueByteLength += frameLength;
        this.outputFrameQueue.frames.push(frame);

        if (priority === RakNetPriority.IMMEDIATE) {
            this.sendFrameQueue();
        }
    }

    private handlePacket(packet: Frame): void {
        const id = packet.content[0];

        // Connection maintenance is answered whatever the state: a peer that pings or
        // hangs up mid-handshake deserves the same treatment as a connected one.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L6077
        if (id === MessageIdentifiers.DISCONNECTION_NOTIFICATION) {
            this.onRemoteDisconnect();
            return;
        }

        if (id === MessageIdentifiers.CONNECTED_PING) {
            this.handleConnectedPing(packet.content).then(
                (encapsulated) => this.sendFrame(encapsulated),
                () => {}
            );
            return;
        }

        // The answer to a ping we sent. Nothing is derived from it - the RTT estimate comes
        // from acknowledgement timing, which is measured against the monotonic clock rather
        // than the epoch timestamps this carries. It is swallowed here purely so it stops
        // being forwarded to the game layer as if it were a Minecraft packet.
        if (id === MessageIdentifiers.CONNECTED_PONG) {
            return;
        }

        if (this.state === SessionStatus.CONNECTING) {
            if (this.role === RakNetRole.SERVER) {
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
                return;
            }

            if (id === MessageIdentifiers.CONNECTION_REQUEST_ACCEPTED) {
                this.handleConnectionRequestAccepted(packet.content);
            }
            return;
        }

        if (this.state === SessionStatus.CONNECTED) {
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
        // Losing this stalls the handshake until the peer retries the whole thing.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L3553
        sendPacket.reliability = FrameReliability.RELIABLE_ORDERED;
        sendPacket.orderChannel = 0;
        sendPacket.content = pk.getBuffer();

        return sendPacket;
    }

    /**
     * Opens the connected handshake, the client half of {@link handleConnectionRequest}.
     *
     * Called once the offline exchange has agreed an MTU and the session exists. Reliable
     * ordered and immediate for the same reason the server's reply is: losing it stalls
     * everything until the retransmission timer fires.
     * @param clientGuid - our own guid, not {@link guid}, which holds the remote's.
     */
    public sendConnectionRequest(clientGuid: bigint): void {
        const packet = new ConnectionRequest();
        packet.clientGUID = clientGuid;
        packet.requestTimestamp = BigInt(Date.now());
        packet.encode();

        const frame = new Frame();
        frame.reliability = FrameReliability.RELIABLE_ORDERED;
        frame.orderChannel = 0;
        frame.content = packet.getBuffer();

        this.sendFrame(frame, RakNetPriority.IMMEDIATE);
    }

    /**
     * The server accepted us: answer `NewIncomingConnection` and the connection is up.
     *
     * The mirror image of the server's `NEW_INCOMING_CONNECTION` branch, and like it this
     * is where `openConnection` is emitted - both roles announce a session at the moment
     * the handshake completes, so whatever consumes the event cannot tell the two apart.
     */
    private handleConnectionRequestAccepted(buffer: Buffer): void {
        const accepted = new ConnectionRequestAccepted(buffer);
        accepted.decode();

        const packet = new NewIncomingConnection();
        // The address of the peer we are answering, as RakNet's own client sends it.
        packet.address = this.getAddress();
        packet.requestTimestamp = accepted.requestTimestamp;
        packet.acceptedTimestamp = accepted.acceptedTimestamp;
        packet.encode();

        const frame = new Frame();
        frame.reliability = FrameReliability.RELIABLE_ORDERED;
        frame.orderChannel = 0;
        frame.content = packet.getBuffer();

        this.sendFrame(frame, RakNetPriority.IMMEDIATE);

        this.state = SessionStatus.CONNECTED;
        this.listener.emit('openConnection', this);
    }

    /**
     * Sends a keepalive. RakNet's client pings on a timer so a connection that is idle in
     * both directions still produces traffic before {@link SESSION_TIMEOUT_MS} elapses.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5971
     */
    public sendConnectedPing(): void {
        const packet = new ConnectedPing();
        packet.clientTimestamp = BigInt(Date.now());
        packet.encode();

        const frame = new Frame();
        frame.reliability = FrameReliability.UNRELIABLE;
        frame.orderChannel = 0;
        frame.content = packet.getBuffer();

        this.sendFrame(frame);
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
        if (frame.fragmentSize > MAX_SPLIT_PACKET_COUNT) {
            this.listener
                .getLogger()
                .debug(
                    `Discarded split message declaring ${frame.fragmentSize} fragments from client=${this.getAddress()}`,
                    'RakNet/Session/handleFragment'
                );
            return;
        }

        let entry = this.fragmentsQueue.get(frame.fragmentId);

        if (!entry) {
            // A peer must not be able to open unbounded reassemblies just by varying the
            // fragment id: every one of them pins memory until it completes.
            if (this.fragmentsQueue.size >= MAX_CONCURRENT_SPLITS) {
                this.listener
                    .getLogger()
                    .debug(
                        `Refused split message, ${this.fragmentsQueue.size} already in flight from client=${this.getAddress()}`,
                        'RakNet/Session/handleFragment'
                    );
                return;
            }

            entry = { fragments: new Map(), count: frame.fragmentSize, byteLength: 0, startedAt: monotonicNow() };
            this.fragmentsQueue.set(frame.fragmentId, entry);
        }

        // Every fragment of a message must agree on how many pieces there are.
        if (frame.fragmentSize !== entry.count || frame.fragmentIndex >= entry.count) {
            return;
        }
        if (entry.fragments.has(frame.fragmentIndex)) {
            return;
        }

        entry.fragments.set(frame.fragmentIndex, frame);
        entry.byteLength += frame.content.byteLength;

        if (entry.fragments.size !== entry.count) {
            return;
        }

        // The total size is already known, so the message is assembled into one buffer of
        // exactly that size. Appending fragment by fragment through a BinaryStream instead
        // reallocates the whole accumulated payload on every fragment, which is quadratic:
        // a 64 KiB message arriving as 48 fragments cost ~15 ms of pure copying.
        const content = Buffer.allocUnsafe(entry.byteLength);
        let offset = 0;
        // Ensure the correctness of the buffer orders
        for (let i = 0; i < entry.count; i++) {
            offset += entry.fragments.get(i)!.content.copy(content, offset);
        }

        const assembledFrame = new Frame();
        assembledFrame.content = content;

        assembledFrame.reliability = frame.reliability;
        assembledFrame.reliableIndex = frame.reliableIndex;
        assembledFrame.sequenceIndex = frame.sequenceIndex;
        assembledFrame.orderIndex = frame.orderIndex;
        assembledFrame.orderChannel = frame.orderChannel;

        this.fragmentsQueue.delete(frame.fragmentId);

        // The fragments were already deduplicated one by one on their own message numbers,
        // so the reassembled message goes straight to the ordering stage.
        this.handleAssembledFrame(assembledFrame);
    }

    /**
     * A split message that never completes would otherwise hold its fragments until the
     * session ends. RakNet had a timeout sweep for this; in the archived source it is
     * commented out, so this is deliberately stricter than the reference.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L3255
     */
    private expireSplitPackets(timestamp: number): void {
        for (const [fragmentId, entry] of this.fragmentsQueue) {
            if (entry.startedAt + SPLIT_PACKET_TIMEOUT_MS < timestamp) {
                this.fragmentsQueue.delete(fragmentId);
            }
        }
    }

    /** The ordering half of {@link handleFrame}, reached once a split message is whole. */
    private handleAssembledFrame(frame: Frame): void {
        if (!frame.isOrdered()) {
            this.handlePacket(frame);
            return;
        }

        const orderChannel = frame.orderChannel!;
        if (!Number.isInteger(orderChannel) || orderChannel < 0 || orderChannel >= MAX_CHANNELS) {
            return;
        }

        const orderIndex = frame.orderIndex!;
        const expectedOrderIndex = this.inputOrderIndex[orderChannel]!;

        if (orderIndex === expectedOrderIndex) {
            if (frame.isSequenced()) {
                const sequenceIndex = frame.sequenceIndex!;
                if (this.isOlderOrderedFrame(sequenceIndex, this.inputHighestSequenceIndex[orderChannel]!)) {
                    return;
                }
                this.inputHighestSequenceIndex[orderChannel] = (sequenceIndex + 1) % TRIAD_RANGE;
                this.handlePacket(frame);
            } else {
                this.inputOrderIndex[orderChannel] = (orderIndex + 1) % TRIAD_RANGE;
                this.inputHighestSequenceIndex[orderChannel] = 0;
                this.handlePacket(frame);
                this.processOrderingHeap(orderChannel);
            }
        } else if (!this.isOlderOrderedFrame(orderIndex, expectedOrderIndex)) {
            this.bufferOutOfOrderFrame(orderChannel, orderIndex, frame);
        }
    }

    // ---------------------------------------------------------------- transmission

    public sendFrameQueue(): void {
        if (this.outputFrameQueue.frames.length > 0) {
            this.outputFrameQueue.sequenceNumber = this.outputSequenceNumber;
            // Datagram sequence numbers are 24 bit on the wire, and datagramHistory is
            // keyed by them, so they have to wrap rather than grow past the field width.
            this.outputSequenceNumber = (this.outputSequenceNumber + 1) % TRIAD_RANGE;
            this.sendFrameSet(this.outputFrameQueue);
            this.outputFrameQueue = new FrameSet();
            this.outputFrameQueueByteLength = DATAGRAM_HEADER_BYTE_LENGTH;
        }
    }

    private sendFrameSet(frameSet: FrameSet): void {
        this.sendPacket(frameSet);

        const sentAt = monotonicNow();
        const deadline = sentAt + this.getRetransmissionTimeout();

        // Record which messages rode in this datagram, so an ACK/NACK naming its
        // sequence number can be resolved back to them.
        const messageNumbers: number[] = [];
        for (const frame of frameSet.frames) {
            if (!frame.isReliable() || typeof frame.reliableIndex !== 'number') continue;

            const existing = this.resendBuffer.get(frame.reliableIndex);
            if (existing) {
                // A retransmission: the message is stored once, keyed by its own identity.
                existing.nextActionTime = deadline;
                existing.timesSent++;
            } else {
                this.resendBuffer.set(frame.reliableIndex, { frame, nextActionTime: deadline, timesSent: 1 });
            }

            messageNumbers.push(frame.reliableIndex);
        }

        if (messageNumbers.length > 0) {
            this.datagramHistory.set(frameSet.sequenceNumber, { messageNumbers, sentAt });
            this.pruneDatagramHistory();
        }
    }

    /**
     * Retransmits everything whose acknowledgement is overdue. A NACK only arrives when the
     * peer notices a gap, which it cannot do for the last datagram of a burst - without
     * this pass that tail is simply lost.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1908
     */
    private resendTimedOutMessages(timestamp: number): void {
        let requeued = false;

        for (const entry of this.resendBuffer.values()) {
            if (entry.nextActionTime > timestamp) continue;

            // sendFrameSet refreshes nextActionTime once the frame actually goes out.
            this.addFrameToQueue(entry.frame, RakNetPriority.NORMAL);
            requeued = true;
        }

        if (requeued) {
            this.sendFrameQueue();
        }
    }

    /**
     * `2 * estimatedRTT + 4 * deviationRTT + variance`, capped, and equal to the cap until
     * the first RTT sample lands.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/CCRakNetSlidingWindow.cpp#L288
     */
    private getRetransmissionTimeout(): number {
        if (this.estimatedRTT === null) {
            return RTO_MAX_MS;
        }

        return Math.min(RTO_MAX_MS, 2 * this.estimatedRTT + 4 * this.deviationRTT + RTO_ADDITIONAL_VARIANCE_MS);
    }

    /**
     * Folds one round trip measurement into the smoothed estimate.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/CCRakNetSlidingWindow.cpp#L210
     */
    private onRoundTripSample(rtt: number): void {
        if (rtt < 0) return;

        if (this.estimatedRTT === null) {
            this.estimatedRTT = rtt;
            this.deviationRTT = rtt;
            return;
        }

        const d = 0.05;
        const difference = rtt - this.estimatedRTT;
        this.estimatedRTT += d * difference;
        this.deviationRTT += d * (Math.abs(difference) - this.deviationRTT);
    }

    /**
     * Flushes the pending acknowledgements, split across as many datagrams as the MTU
     * needs. A single ACK naming thousands of sequence numbers would not fit in one.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L3649
     */
    private sendAcknowledgements(): void {
        if (this.ackQueue.size > 0) {
            this.sendAcknowledgePackets(this.ackQueue, () => new ACK());
            this.ackQueue.clear();
        }

        if (this.lostFrameSequences.size > 0) {
            this.sendAcknowledgePackets(this.lostFrameSequences, () => new NACK());
            this.lostFrameSequences.clear();
        }
    }

    private sendAcknowledgePackets(sequences: Set<number>, create: () => AcknowledgePacket): void {
        // Worst case every record is a range: 1 flag byte plus two triads. Sizing against
        // that means consecutive runs, which collapse into one record, only under-fill.
        const recordsPerPacket = Math.max(1, Math.floor((this.getMTU() - 3) / 7));
        const sorted = Array.from(sequences).sort((a, b) => a - b);

        for (let i = 0; i < sorted.length; i += recordsPerPacket) {
            const packet = create();
            packet.sequenceNumbers = sorted.slice(i, i + recordsPerPacket);
            this.sendPacket(packet);
        }
    }

    /**
     * Bounds the datagram history so a datagram that is never acknowledged nor reported
     * lost cannot pin its messages forever.
     * Insertion order in a Map is the send order, so the head is always the oldest entry.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakNetDefines.h#L105 (RESEND_BUFFER_ARRAY_LENGTH)
     */
    private pruneDatagramHistory(): void {
        while (this.datagramHistory.size > MAX_DATAGRAM_HISTORY) {
            const oldest = this.datagramHistory.keys().next().value!;
            for (const reliableIndex of this.datagramHistory.get(oldest)!.messageNumbers) {
                this.resendBuffer.delete(reliableIndex);
            }
            this.datagramHistory.delete(oldest);
        }
    }

    private sendPacket(packet: Packet): void {
        this.listener.sendPacket(packet, this.rinfo);
    }

    /**
     * Queues the goodbye. Tears nothing down on its own - {@link disconnect} is what moves
     * the session, and this is only the message it sends on the way.
     */
    public close(): void {
        const frame = new Frame();
        // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L3563
        frame.reliability = FrameReliability.RELIABLE_ORDERED;
        frame.orderChannel = 0;
        frame.content = Buffer.from([MessageIdentifiers.DISCONNECTION_NOTIFICATION]);
        this.sendFrame(frame, RakNetPriority.IMMEDIATE);
    }

    /**
     * Hangs up, and keeps the session alive until the peer has acknowledged it.
     *
     * The goodbye is reliable, which buys nothing if the session is destroyed in the same
     * breath: it would go out once, and a lost datagram would take the message with it -
     * along with whatever was framed beside it, which for a kick is the `DisconnectPacket`
     * carrying the reason. The peer would then sit out its own ten second timeout and show
     * the player nothing. So the session moves to {@link SessionStatus.DISCONNECTING} and is
     * forgotten by {@link update} once the acknowledgement lands, which is RakNet's
     * DISCONNECT_ASAP: the system stays in the list until `IsOutgoingDataWaiting` goes false.
     *
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L3565
     * @param reason - reported to whoever owns the session; never sent to the peer.
     */
    public disconnect(reason = 'client disconnect'): void {
        if (this.isClosing()) return;

        this.close();
        this.beginDisconnect(DisconnectMode.ASAP, reason);
    }

    /**
     * Forgets the session at once, with no goodbye and no wait for one.
     *
     * RakNet's `CloseConnectionInternal(..., sendDisconnectionNotification=false,
     * performImmediate=true)`: what a timeout does, and what a socket being torn down out
     * from under a session has to do, since nothing will be left ticking to finish a linger.
     * @param reason - defaults to the one the pending disconnect was started with.
     */
    public disconnectImmediate(reason: string = this.disconnectReason): void {
        if (this.isDisconnected()) return;

        this.state = SessionStatus.DISCONNECTED;
        this.listener.removeSession(this, reason);
    }

    /**
     * The peer said goodbye.
     *
     * Nothing is sent back - RakNet answers a DISCONNECTION_NOTIFICATION with an
     * acknowledgement and nothing else, and a goodbye of our own would only reach an address
     * that has already forgotten us. The session is held open for one more pass so that
     * acknowledgement actually goes out, which is DISCONNECT_ON_NO_ACK.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L6095
     */
    private onRemoteDisconnect(): void {
        if (this.isClosing()) return;

        this.beginDisconnect(DisconnectMode.ON_NO_ACK, 'client disconnect');
    }

    private beginDisconnect(mode: DisconnectMode, reason: string): void {
        this.state = SessionStatus.DISCONNECTING;
        this.disconnectMode = mode;
        this.disconnectReason = reason;
        this.disconnectDeadline = monotonicNow() + DISCONNECT_LINGER_TIMEOUT_MS;

        // Flushed here rather than left to the next tick: the acknowledgement owed for the
        // datagram that carried the peer's goodbye is the one thing it is waiting for.
        this.sendAcknowledgements();
        this.sendFrameQueue();
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

    /**
     * Whether the session is on its way out, whether or not it has got there yet.
     *
     * The guard every teardown path shares: a session lingering in
     * {@link SessionStatus.DISCONNECTING} has already said what it had to say, and must not
     * be sent through any of it a second time.
     */
    public isClosing(): boolean {
        return this.state === SessionStatus.DISCONNECTING || this.state === SessionStatus.DISCONNECTED;
    }

    /**
     * Whether the session exists but has not finished the connected handshake.
     *
     * RakNet splits this into UNVERIFIED_SENDER and HANDLING_CONNECTION_REQUEST; there is one
     * state here because nothing needs to tell them apart. What needs the question is the
     * offline handler, deciding whether a repeated `OpenConnectionRequest2` is a duplicate
     * whose reply was lost - which it can only be while the handshake is still running.
     */
    public isHandshaking(): boolean {
        return this.state === SessionStatus.CONNECTING;
    }

    public getListener(): RakNetPeer {
        return this.listener;
    }

    /**
     * The smoothed round trip time in milliseconds, or null before the first
     * acknowledgement has been measured.
     */
    public getRTT(): number | null {
        return this.estimatedRTT;
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
