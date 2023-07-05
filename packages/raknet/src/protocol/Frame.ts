import BinaryStream from '@jsprismarine/jsbinaryutils';
import BitFlags from './BitFlags.js';
import FrameReliability from './FrameReliability.js';
import assert from 'assert';
import { IOrderedElement } from './datastructures/OrderingHeap.js';
import { RakNetPriority } from '../Session.js';

// https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/ReliabilityLayer.cpp#L133
// It's the maximum number of bytes a frameset can take. (splitted reliable sequenced).
export const MAX_FRAME_BYTE_LENGTH = 23;

export default class Frame implements IOrderedElement {
    public reliability = FrameReliability.UNRELIABLE;

    public reliableIndex: number | null = null;

    public sequenceIndex: number | null = null;

    public orderIndex: number | null = null;
    public orderChannel!: NonNullable<number>;

    public fragmentSize = 0;
    public fragmentId!: number;
    public fragmentIndex!: number;

    public content!: Buffer;

    public weight!: number;
    public priority!: RakNetPriority;

    public fromBinary(stream: BinaryStream): Frame {
        const header = stream.readByte();
        this.reliability = (header & 0xe0) >> 5;

        // Length from bits to bytes
        const length = Math.ceil(stream.readShort() / 8);

        if (this.isReliable()) {
            this.reliableIndex = stream.readTriadLE();
        }

        if (this.isSequenced()) {
            this.sequenceIndex = stream.readTriadLE();
        }

        if (this.isOrdered()) {
            this.orderIndex = stream.readTriadLE();
            this.orderChannel = stream.readByte();
        } else {
            // https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/ReliabilityLayer.cpp#L2740
            // Fallbacks to 0 as default
            this.orderChannel = 0;
        }

        if ((header & BitFlags.SPLIT) > 0) {
            this.fragmentSize = stream.readInt();
            this.fragmentId = stream.readShort();
            this.fragmentIndex = stream.readInt();
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

    public isReliable(): boolean {
        return [
            FrameReliability.RELIABLE,
            FrameReliability.RELIABLE_ORDERED,
            FrameReliability.RELIABLE_SEQUENCED,
            FrameReliability.RELIABLE_WITH_ACK_RECEIPT,
            FrameReliability.RELIABLE_ORDERED_WITH_ACK_RECEIPT
        ].includes(this.reliability);
    }

    public isSequenced(): boolean {
        return [FrameReliability.RELIABLE_SEQUENCED, FrameReliability.UNRELIABLE_SEQUENCED].includes(this.reliability);
    }

    public isOrdered(): boolean {
        return [
            FrameReliability.UNRELIABLE_SEQUENCED,
            FrameReliability.RELIABLE_ORDERED,
            FrameReliability.RELIABLE_SEQUENCED,
            FrameReliability.RELIABLE_ORDERED_WITH_ACK_RECEIPT
        ].includes(this.reliability);
    }

    public isOrderedExclusive(): boolean {
        return [FrameReliability.RELIABLE_ORDERED, FrameReliability.RELIABLE_ORDERED_WITH_ACK_RECEIPT].includes(
            this.reliability
        );
    }

    public isFragmented(): boolean {
        return this.fragmentSize > 0;
    }
}
