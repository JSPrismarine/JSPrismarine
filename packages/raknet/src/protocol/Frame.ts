import BinaryStream from '@jsprismarine/binaryutils';
import BitFlags from './BitFlags';
import FrameReliability from './FrameReliability';
import assert from 'assert';

// https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/ReliabilityLayer.cpp#L133
// It's the maximum number of bytes a frameset can take. (splitted reliable sequenced).
export const MAX_FRAME_BYTE_LENGTH = 23;

const RELIABLE = 1 << 0;
const SEQUENCED = 1 << 1;
const ORDERED = 1 << 2;
const ORDERED_EXCLUSIVE = 1 << 3;

/**
 * What each reliability implies, indexed by the reliability itself.
 *
 * These are the hottest predicates in the library: `getByteLength` calls four of them,
 * and `Session.addFrameToQueue` calls `getByteLength` on every frame already queued.
 * Written as `[...].includes(this.reliability)` each call allocates its own array and
 * scans it; a table indexed by an enum that is 3 bits wide by construction does not.
 */
const RELIABILITY_TRAITS = new Uint8Array(8);
const trait = (flag: number, ...reliabilities: FrameReliability[]): void => {
    for (const reliability of reliabilities) {
        RELIABILITY_TRAITS[reliability] = (RELIABILITY_TRAITS[reliability] ?? 0) | flag;
    }
};

trait(
    RELIABLE,
    FrameReliability.RELIABLE,
    FrameReliability.RELIABLE_ORDERED,
    FrameReliability.RELIABLE_SEQUENCED,
    FrameReliability.RELIABLE_WITH_ACK_RECEIPT,
    FrameReliability.RELIABLE_ORDERED_WITH_ACK_RECEIPT
);
trait(SEQUENCED, FrameReliability.RELIABLE_SEQUENCED, FrameReliability.UNRELIABLE_SEQUENCED);
trait(
    ORDERED,
    FrameReliability.UNRELIABLE_SEQUENCED,
    FrameReliability.RELIABLE_ORDERED,
    FrameReliability.RELIABLE_SEQUENCED,
    FrameReliability.RELIABLE_ORDERED_WITH_ACK_RECEIPT
);
trait(ORDERED_EXCLUSIVE, FrameReliability.RELIABLE_ORDERED, FrameReliability.RELIABLE_ORDERED_WITH_ACK_RECEIPT);

export default class Frame {
    public reliability = FrameReliability.UNRELIABLE;

    public reliableIndex: number | null = null;

    public sequenceIndex: number | null = null;

    public orderIndex: number | null = null;
    public orderChannel!: NonNullable<number>;

    public fragmentSize = 0;
    public fragmentId!: number;
    public fragmentIndex!: number;

    public content!: Buffer;

    public fromBinary(stream: BinaryStream): Frame {
        const header = stream.readByte();
        this.reliability = (header & 0xe0) >> 5;

        // Length from bits to bytes. This field is unsigned on the wire (toBinary writes
        // it with writeUnsignedShort); reading it signed would yield a negative length
        // that walks the read cursor backwards instead of forwards.
        const length = Math.ceil(stream.readUnsignedShort() / 8);
        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L2761
        if (length <= 0) {
            throw new Error(`Invalid Frame length=${length}`);
        }

        // These are all unsigned 24 bit counters that wrap; reading them signed would
        // turn everything past 0x7fffff negative and break the ordering comparisons.
        if (this.isReliable()) {
            this.reliableIndex = stream.readUnsignedTriadLE();
        }

        if (this.isSequenced()) {
            this.sequenceIndex = stream.readUnsignedTriadLE();
        }

        if (this.isOrdered()) {
            this.orderIndex = stream.readUnsignedTriadLE();
            this.orderChannel = stream.readByte();
        }

        if ((header & BitFlags.SPLIT) > 0) {
            this.fragmentSize = stream.readUnsignedInt();
            this.fragmentId = stream.readUnsignedShort();
            this.fragmentIndex = stream.readUnsignedInt();

            // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L2764
            if (this.fragmentIndex >= this.fragmentSize) {
                throw new Error(`Invalid Frame fragment index=${this.fragmentIndex}, count=${this.fragmentSize}`);
            }
        }

        this.content = stream.read(length);
        return this;
    }

    public toBinary(): BinaryStream {
        const stream = new BinaryStream();
        const fragmented = this.isFragmented();

        stream.writeByte((this.reliability << 5) | (fragmented ? BitFlags.SPLIT : 0));
        stream.writeUnsignedShort(this.content.byteLength << 3);

        if (this.isReliable()) {
            assert(typeof this.reliableIndex === 'number', 'Invalid ReliableIndex for reliable Frame');
            stream.writeUnsignedTriadLE(this.reliableIndex);
        }

        if (this.isSequenced()) {
            assert(typeof this.sequenceIndex === 'number', 'Invalid SequenceIndex for sequenced Frame');
            stream.writeUnsignedTriadLE(this.sequenceIndex);
        }

        if (this.isOrdered()) {
            assert(typeof this.orderIndex === 'number', 'Invalid OrderIndex for ordered Frame');
            stream.writeUnsignedTriadLE(this.orderIndex);
            assert(typeof this.orderChannel === 'number', 'Invalid OrderChannel for ordered FrameSet');
            stream.writeByte(this.orderChannel);
        }

        if (fragmented) {
            stream.writeUnsignedInt(this.fragmentSize);
            stream.writeUnsignedShort(this.fragmentId);
            stream.writeUnsignedInt(this.fragmentIndex);
        }

        stream.write(this.content);
        return stream;
    }

    /**
     * Writes this frame straight into an already sized buffer, returning the offset just
     * past it. Byte for byte the same as {@link toBinary}, which stays as the readable
     * reference the equivalence test compares against.
     *
     * The difference is where the bytes land: `toBinary` builds a `BinaryStream`, whose
     * `write` appends by rebuilding a plain JS number array, so encoding one datagram
     * costs O(frames²). The caller knows the exact size up front via
     * {@link getByteLength}, so there is nothing to grow.
     */
    public writeInto(out: Buffer, offset: number): number {
        const fragmented = this.isFragmented();

        out[offset++] = (this.reliability << 5) | (fragmented ? BitFlags.SPLIT : 0);
        offset = out.writeUInt16BE(this.content.byteLength << 3, offset);

        if (this.isReliable()) {
            assert(typeof this.reliableIndex === 'number', 'Invalid ReliableIndex for reliable Frame');
            offset = out.writeUIntLE(this.reliableIndex, offset, 3);
        }

        if (this.isSequenced()) {
            assert(typeof this.sequenceIndex === 'number', 'Invalid SequenceIndex for sequenced Frame');
            offset = out.writeUIntLE(this.sequenceIndex, offset, 3);
        }

        if (this.isOrdered()) {
            assert(typeof this.orderIndex === 'number', 'Invalid OrderIndex for ordered Frame');
            offset = out.writeUIntLE(this.orderIndex, offset, 3);
            assert(typeof this.orderChannel === 'number', 'Invalid OrderChannel for ordered FrameSet');
            out[offset++] = this.orderChannel & 0xff;
        }

        if (fragmented) {
            offset = out.writeUInt32BE(this.fragmentSize, offset);
            offset = out.writeUInt16BE(this.fragmentId, offset);
            offset = out.writeUInt32BE(this.fragmentIndex, offset);
        }

        return offset + this.content.copy(out, offset);
    }

    public getByteLength(): number {
        return (
            3 +
            this.content.byteLength +
            (this.isReliable() ? 3 : 0) +
            (this.isSequenced() ? 3 : 0) +
            (this.isOrdered() ? 4 : 0) +
            (this.isFragmented() ? 10 : 0)
        );
    }

    // A reliability outside 0-7 has no traits, exactly as it matched no entry of the
    // arrays these predicates used to scan: the out of range read yields undefined,
    // and `undefined & flag` is 0.
    public isReliable(): boolean {
        return (RELIABILITY_TRAITS[this.reliability]! & RELIABLE) !== 0;
    }

    public isSequenced(): boolean {
        return (RELIABILITY_TRAITS[this.reliability]! & SEQUENCED) !== 0;
    }

    public isOrdered(): boolean {
        return (RELIABILITY_TRAITS[this.reliability]! & ORDERED) !== 0;
    }

    public isOrderedExclusive(): boolean {
        return (RELIABILITY_TRAITS[this.reliability]! & ORDERED_EXCLUSIVE) !== 0;
    }

    public isFragmented(): boolean {
        return this.fragmentSize > 0;
    }
}
