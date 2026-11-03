import { ByteReader } from '../util/ByteReader';
import { CorruptionError } from '../Errors';
import { compareBytewise } from '../util/Comparator';
import { compareInternalKeys } from './InternalKey';

export interface BlockEntry {
    key: Buffer;
    value: Buffer;
}

/** The predecessor a restart point's key is decoded against: it shares nothing with anything. */
const EMPTY_KEY = Buffer.alloc(0);

/**
 * Reads a decompressed block: the entries, plus the restart array that makes it searchable.
 *
 * @see BlockBuilder for the layout.
 */
export class BlockReader {
    private readonly data: Buffer;
    private readonly restartOffset: number;
    private readonly restartCount: number;
    private readonly compareKeyRange: (data: Buffer, offset: number, length: number, target: Buffer) => number;
    private seekScratch: Buffer | null = null;

    public constructor(data: Buffer, comparator: (a: Buffer, b: Buffer) => number) {
        if (data.byteLength < 4) throw new CorruptionError('Block is too short to hold a restart count');

        this.data = data;
        this.compare = comparator;
        // Internal keys compare their trailing sequence/type in descending order, so bytewise
        // range comparison would skip an exact user key during a database point lookup.
        this.compareKeyRange =
            comparator === compareBytewise
                ? compareBufferRange
                : comparator === compareInternalKeys
                  ? compareInternalKeyRange
                  : (left, offset, length, right) => comparator(left.subarray(offset, offset + length), right);
        this.restartCount = data.readUInt32LE(data.byteLength - 4);
        this.restartOffset = data.byteLength - 4 - this.restartCount * 4;

        if (this.restartOffset < 0) {
            throw new CorruptionError(`Block declares ${this.restartCount} restart points it cannot hold`);
        }
    }

    private readonly compare: (a: Buffer, b: Buffer) => number;

    private restartAt(index: number): number {
        return this.data.readUInt32LE(this.restartOffset + index * 4);
    }

    /**
     * Decodes the entry at `offset`, given the key of the entry before it, and reports where the
     * next one starts. `previousKey` supplies the shared prefix this entry left out.
     */
    private decodeAt(offset: number, previousKey: Buffer): { entry: BlockEntry; next: number } {
        const reader = new ByteReader(this.data, offset, this.restartOffset - offset);

        const shared = reader.varint32();
        const nonShared = reader.varint32();
        const valueLength = reader.varint32();

        if (shared > previousKey.byteLength) {
            throw new CorruptionError(`Entry shares ${shared} bytes with a ${previousKey.byteLength} byte key`);
        }

        const keySuffix = reader.bytes(nonShared);
        const key = Buffer.allocUnsafe(shared + nonShared);
        previousKey.copy(key, 0, 0, shared);
        keySuffix.copy(key, shared);

        return { entry: { key, value: reader.bytes(valueLength) }, next: reader.position };
    }

    public *entries(): IterableIterator<BlockEntry> {
        let offset = 0;
        let previousKey: Buffer = EMPTY_KEY;

        while (offset < this.restartOffset) {
            const { entry, next } = this.decodeAt(offset, previousKey);
            yield entry;
            previousKey = entry.key;
            offset = next;
        }
    }

    /**
     * Every entry from the first one at or after `target`, in order, to the end of the block.
     *
     * Binary search over the restart points to find the last one that starts at or before the
     * target, then a linear scan forward - the only way to read prefix-compressed entries. The
     * scan is bounded by the restart interval, so this reads about sixteen entries rather than
     * the whole block.
     */
    public *seekFrom(target: Buffer): IterableIterator<BlockEntry> {
        if (this.restartCount === 0) return;

        let low = 0;
        let high = this.restartCount - 1;

        while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            const offset = this.restartAt(middle);
            // A restart point stores its key in full, so it can be read without any predecessor.
            const { entry } = this.decodeAt(offset, EMPTY_KEY);

            if (this.compare(entry.key, target) < 0) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }

        let offset = this.restartAt(low);
        let previousKey: Buffer = EMPTY_KEY;
        let reached = false;

        while (offset < this.restartOffset) {
            const { entry, next } = this.decodeAt(offset, previousKey);
            if (reached || this.compare(entry.key, target) >= 0) {
                reached = true;
                yield entry;
            }

            previousKey = entry.key;
            offset = next;
        }
    }

    /** The first entry whose key is at or after `target`, or null when every key sorts before it. */
    public seek(target: Buffer): BlockEntry | null {
        if (this.restartCount === 0) return null;

        let cursor = 0;
        const readVarint32 = (): number => {
            let result = 0;
            for (let shift = 0; shift <= 28; shift += 7) {
                if (cursor >= this.restartOffset) throw new CorruptionError('Entry varint runs past its block');
                const byte = this.data.readUInt8(cursor++);
                result = (result | ((byte & 0x7f) << shift)) >>> 0;
                if ((byte & 0x80) === 0) return result;
            }

            throw new CorruptionError('Entry varint does not terminate within 5 bytes');
        };

        let low = 0;
        let high = this.restartCount - 1;
        while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            cursor = this.restartAt(middle);

            const shared = readVarint32();
            const nonShared = readVarint32();
            const valueLength = readVarint32();
            if (shared !== 0 || cursor + nonShared + valueLength > this.restartOffset) {
                throw new CorruptionError('Restart key is malformed');
            }

            const comparison = this.compareKeyRange(this.data, cursor, nonShared, target);
            if (comparison < 0) low = middle;
            else high = middle - 1;
        }

        cursor = this.restartAt(low);
        let previousLength = 0;
        while (cursor < this.restartOffset) {
            const shared = readVarint32();
            const nonShared = readVarint32();
            const valueLength = readVarint32();
            if (shared > previousLength || cursor + nonShared + valueLength > this.restartOffset) {
                throw new CorruptionError('Entry runs past its block or shares too many key bytes');
            }

            const keyLength = shared + nonShared;
            if (this.seekScratch === null || this.seekScratch.byteLength < keyLength) {
                let capacity = Math.max(32, this.seekScratch?.byteLength ?? 0);
                while (capacity < keyLength) capacity *= 2;
                this.seekScratch = Buffer.allocUnsafe(capacity);
            }

            const scratch = this.seekScratch;
            scratch.copy(scratch, 0, 0, shared);
            this.data.copy(scratch, shared, cursor, cursor + nonShared);
            const valueOffset = cursor + nonShared;
            cursor = valueOffset + valueLength;

            if (this.compareKeyRange(scratch, 0, keyLength, target) >= 0) {
                const key = Buffer.allocUnsafe(keyLength);
                scratch.copy(key, 0, 0, keyLength);
                return { key, value: this.data.subarray(valueOffset, cursor) };
            }

            previousLength = keyLength;
        }

        return null;
    }
}

const compareBufferRange = (left: Buffer, offset: number, length: number, right: Buffer): number =>
    compareBufferRanges(left, offset, length, right, 0, right.byteLength);

const compareInternalKeyRange = (left: Buffer, offset: number, length: number, right: Buffer): number => {
    if (length < 8 || right.byteLength < 8) return compareInternalKeys(left.subarray(offset, offset + length), right);

    const userKeyLength = length - 8;
    const rightUserKeyLength = right.byteLength - 8;
    const byUserKey = compareBufferRanges(left, offset, userKeyLength, right, 0, rightUserKeyLength);
    if (byUserKey !== 0) return byUserKey;

    const leftTrailer = left.readBigUInt64LE(offset + userKeyLength);
    const rightTrailer = right.readBigUInt64LE(rightUserKeyLength);
    if (leftTrailer > rightTrailer) return -1;
    if (leftTrailer < rightTrailer) return 1;
    return 0;
};

const compareBufferRanges = (
    left: Buffer,
    leftOffset: number,
    leftLength: number,
    right: Buffer,
    rightOffset: number,
    rightLength: number
): number => {
    // Buffer.compare performs the bytewise prefix check in native code without copying either key.
    return Buffer.compare(
        left.subarray(leftOffset, leftOffset + leftLength),
        right.subarray(rightOffset, rightOffset + rightLength)
    );
};

export default BlockReader;
